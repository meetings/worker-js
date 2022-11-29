#!/usr/bin/env nodejs
/*jslint todo: true, vars: true, eqeq: true, nomen: true, sloppy: true, white: true, unparam: true, node: true */

process.noDeprecation = true;

var settings = require('./settings');
var functions = require('./functions');

var _ = require('underscore');
var gearman = require('abraxas');
var Promise = require("bluebird");
var sprintf = require('sprintf-js').sprintf;
var apn = require('apn');
var gcm = require('node-gcm');
var argv = require('minimist')(process.argv.slice(2));
var exec = require('exec');
var moment = require('moment');
var saml2 = require('saml2-js');
var fs = require('fs');
var utils = require('./lib/utils.js');

function create_saml2_sp( domain, provider ) {
    var pemdir = settings.get('install_dir') + '/files/' + settings.get('stage_dir') + '/saml2/';

    var sp_options = {
        entity_id: "https://"+domain+"/meetings_raw/saml2entity/"+provider+".xml",
        nameid_format: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
        sign_get_request: true,
        allow_unencrypted_assertion : true,
        private_key: fs.readFileSync( pemdir + 'rsaprivkey.pem' ).toString(),
        certificate: fs.readFileSync( pemdir + 'rsacert.pem' ).toString(),
        assert_endpoint: "https://"+domain+"/meetings_global/saml2ac/" + provider
    };

    return new saml2.ServiceProvider(sp_options);
}

function create_saml2_idp( provider ) {
    var provider_dir = settings.get('install_dir') + '/files/common/saml2/providers/';

    var idp_options;

    try {
        idp_options = require( provider_dir + provider + '.json' );
    }
    catch( e ) {
        throw 'Unknown identity provider: ' + provider;
    }

    return new saml2.IdentityProvider(idp_options);
}

var workers = [];
workers.push( {
    name: 'test_js_worker', timeout: 1, handler: function( params, task, resolve ) {
        return resolve( { result : 'OK: ' + task.payload } );
    }
}, {
    name: 'test_js_worker_long', timeout: 11, handler: function( params, task, resolve ) {
        return resolve( new Promise( function( resolve ) {
            setTimeout( function() { resolve( { result : 'OK: ' + task.payload } ); }, 10*1000 );
        } ) );
    }
}, {
    name: 'test_js_worker_timeout', timeout: 1, handler: function( params, task, resolve ) {
        return resolve( new Promise( function( resolve ) {
            setTimeout( function() { resolve( { result : "OK even though was not supposed to" } ); }, 3000 );
        } ) );
    }
}, {
    name: 'public_job_check_client_sync_log', timeout: 10, handler: function( params, task, resolve ) {
        resolve( new Promise( function( resolve, reject ) {
            var ssh_exec = settings.get('development_check_client_sync_log_command');
            if ( ! ssh_exec ) {
                var identity_file = settings.get('install_dir') + '/files/live/ssh_keys/fiddler_get_client_sync_log';
                ssh_exec = ['ssh', '-t', '-t', '-o', 'PasswordAuthentication no', '-o', 'StrictHostKeyChecking no', '-o', 'CheckHostIP no', '-i', identity_file, '-p', '20146', 'fiddler@gateway.dicole.com' ];
            }
            exec( ssh_exec, { timeout: 9000 }, function(err, out, code) {
                var out_string = out ? out.toString() : '';
                var lines = out_string.split(/\n/);
                var last_fetch = '';

                lines.forEach( function( line ) {
                    if ( line.match(/Refetching user list/) ) {
                        last_fetch = line;
                    }
                } );

                var datematch = last_fetch.match(/(\w\w\w\ +\d\d? +\d\d?\:\d\d?:\d\d?) /) || [];
                if ( ! datematch[0] ) {
                    reject( { error : { code : 1, retry: 0, message: "Could not find first refetch log entry. Possible error: " + err } } );
                }
                var last_moment = moment.utc( datematch[0], 'MMM D HH:mm:ss');

                var now = moment.utc();

                var passed_ms = now.valueOf()-last_moment.valueOf();
                var passed_hours = passed_ms/1000/60/60;
                passed_hours = Math.ceil( passed_hours * 100 ) / 100;

                if ( params.debug ) {
                    console.log( out_string );
                }

                if ( passed_hours > 0.5 ) {
                    reject( { error : { code : 2, retry: 0, message: 'error: ' + passed_hours + ' hours passed since last fetch' } } );
                }
                else {
                    resolve( { result: 'ok: ' + passed_hours + ' hours passed since last fetch' } );
                }
            } );
        }));
    }
}, {
    name: 'saml2_get_metadata', timeout: 10, handler: function( params, task, resolve ) {
        var sp = create_saml2_sp( params.domain, params.provider );
        resolve({ result : sp.create_metadata() });
    }
}, {
    name: 'saml2_get_login_url', timeout: 10, handler: function( params, task, resolve ) {
        var sp = create_saml2_sp( params.domain, params.provider );
        var idp = create_saml2_idp( params.provider );
        var options = {};
        if ( params.relay_state ) {
            options.relay_state = params.relay_state;
        }

        sp.create_login_request_url(idp, options, function(err, login_url, request_id) {
            if (err != null) {
                return resolve( Promise.reject( err ) );
            }
            resolve( { result : login_url } )
        } );
    }
}, {
    name: 'saml2_assert_body', timeout: 10, handler: function( params, task, resolve ) {
        var sp = create_saml2_sp( params.domain, params.provider );
        var idp = create_saml2_idp( params.provider );
        var options = { request_body : params.request_data };

        sp.post_assert(idp, options, function(err, saml_response) {
            if (err != null) {
                return resolve( Promise.reject( err ) );
            }
            var valid_assert_endpoint = "https://"+params.domain+"/meetings_global/saml2ac/" + params.provider;
            if ( saml_response.response_header.destination != valid_assert_endpoint ) {
                return resolve( Promise.reject( "Destination does not match assert_endpoint" ) );
            }
            resolve( { result : saml_response } )
        } );
    }
}, {
    name: 'saml2_get_logout_url', timeout: 10, handler: function( params, task, resolve ) {
        var sp = create_saml2_sp( params.domain, params.provider );
        var idp = create_saml2_idp( params.provider );
        var options = {
            name_id: params.name_id,
            session_index: params.session_index
        };

        sp.create_logout_request_url(idp, options, function(err, logout_url) {
            if (err != null) {
                return resolve( Promise.reject( err ) );
            }
            resolve( { result : logout_url } )
        } );
    }
}, {
    name: 'send_ios_push_notification', timeout: 15, handler: function( params, task, resolve ) {
        var p = utils.validate_and_combine_params( params, {
            badge : 0,
            alert : '',
            extra : {},
            category : '',
            token : { required : 1, require_true : 1 },
            app_target : ''
        } );

        if ( ! p.app_target ) {
            p.app_target = 'default';
        }

        var production = true;
        var folder = '/files/live/ios_secrets/' + p.app_target;

        if ( settings.get('development_push_notifications') ) {
            production = false;
            folder = '/files/dev/ios_secrets/default';
        }

        folder = settings.get('install_dir') + folder;

        var connection_options = {
            cert : folder + '/cert.pem',
            key : folder + '/key.pem',
            production : production,
            fastMode : true,
        };

        var resolved = false;
        var connection_log = [];
        var connection = new apn.Connection( connection_options );

        // Then 1 second has elapsed since transmisson ends, expect success
        connection.on('transmitted', function() {
            connection_log.push( { transmitted : 1 } );
            setTimeout( function() {
                if ( resolved ) { return; }
                resolved = true;
                resolve( { result : 1, log : connection_log } );
            }, 1000 );
        } );

        setTimeout( function() {
            connection_log.push( { timeout : 'after 10s' } );
            if ( resolved ) { return; }
            resolved = true;
            resolve( Promise.reject( { error : { code : 1, retry : 1, log : connection_log } } ) );
        }, 10000 );

        connection.on('error', function( error ) {
            connection_log.push( { error : error } );
        } );

        connection.on('socketError', function( error ) {
            connection_log.push( { socketError : error } );
        } );

        connection.on('transmissionError', function( error_code ) {
            if ( resolved ) { return; }
            resolved = true;

            connection_log.push( { transmissionError : { apple_code : error_code } } );

            var retry = 1;
            if ( error_code && error_code < 10 ) {
                retry = 0;
            }
            resolve( Promise.reject( { error : { code : 1, retry : retry, log : connection_log } } ) );
        } );

        var notification = new apn.Notification();
        notification.badge = parseInt( p.badge, 10 );
        notification.alert = p.alert;
        notification.payload = _.extend( {}, p.extra || {} );

        if ( p.category ) {
            notification.category = p.category;
        }

        if ( p.alert ) {
            notification.sound = 'default';
        }

        connection.pushNotification( notification, new apn.Device( p.token ) );
        connection.shutdown();
    }
}, {
    name: 'send_android_push_notification', timeout: 10, handler: function( params, task, resolve ) {
        var p = utils.validate_and_combine_params( params, {
            alert : '',
            extra : {},
            token : { required : 1, require_true : 1 },
            app_target : 'default'
        } );

        if ( ! p.app_target ) {
            p.app_target = 'default';
        }

        var gcm_sender_module = './files/live/gcm_sender';

        if ( settings.get('development_push_notifications') ) {
            gcm_sender_module = './files/dev/gcm_sender';
        }

        var sender = new gcm.Sender( require( gcm_sender_module ).sender_id );

        var titles = {
            swipetomeet : 'SwipeToMeet',
            beta_swipetomeet : 'SwipeToMeet',
            cmeet : 'cMeet',
            beta : 'Meetin.gs',
            'default' : 'Meetin.gs',
        };

        var message = new gcm.Message( {
            priority: 'high',
            data: p.extra || {},
            notification: {
                title: titles[ p.app_target ] || titles.default,
                body: p.alert,
            }
        } );

        message.addData("style", "inbox");
        message.addData("summaryText", "There are %n% notifications");
        message.addData("ledColor", [0,103,207,233]);

        sender.sendNoRetry( message, { registrationIds: [ p.token ] }, function(err, result) {
            resolve( new Promise( function( resolve ) {
                if ( err ) {
                    throw { error : { code : 1, retry : 1, message : utils.neat_inspect( err ) } };
                }
                resolve( { result : 1, result_data : utils.neat_inspect( result ) } );
            } ) );
        } );
    }
} );

var gearman_servers = _.map( settings.get('gearman_servers'), function( server ) {
    var host = server.host || '127.0.0.1';
    var port = server.port || '4730';
    return host + ":" + port;
} );

var gearman_client = '';
if ( ! argv.test_function ) {
    gearman_client = gearman.Client.connect( {
        servers: gearman_servers,
        defaultEncoding: 'utf8',
        maxJobs : settings.get('concurrent_jobs') || 1,
     } );
}

var running_jobs = {};
var next_job_id = 1;

function log( start_date, type, name, params, payload, result_length, result ) {
    var current_date = new Date();
    var elapsed_millis = current_date.getTime() - start_date.getTime();

    var auth_user_id = params.auth_user_id || '-';
    delete params.auth_user_id;

    var request_id = params.request_id || 'none';
    delete params.request_id;

    var log_components = [
        sprintf( '%.3f', start_date.getUTCSeconds() + ( start_date.getUTCMilliseconds() / 1000 ) ),
        type,
        sprintf( '%.3f', elapsed_millis / 1000 ),
        name,
        auth_user_id,
        payload || JSON.stringify( params ),
        result_length,
        request_id
    ];

    if ( settings.get('development_logging') || argv.test_function ) {
        log_components.unshift( start_date.toISOString() );
        console.log( log_components.join( " " ) );
        console.log( "" );
        console.log( "---> " + utils.neat_inspect( result ) );
        console.log( "" );
        console.log( "" );
    }
    else {
        if ( type == 'ERROR' ) {
            log_components.push( '---> ' + utils.neat_inspect( result ) );
        }
        console.log( log_components.join( " " ) );
    }
}

functions.find_workers().forEach( function ( worker ) {
    workers.push( worker );
} );

_.each( workers, function( worker ) {
    var wrapped_handler = function( task ) {
        var in_process_id = next_job_id++;
        running_jobs[ in_process_id ] = task;

        var start_date = new Date();
        var params = '';
        var timeout = false;

        var promise = new Promise( function( resolve, reject ) {
            if ( task.payload && task.payload.match( /^\s*\{/ ) ) {
                params = JSON.parse( task.payload );
            }

            if ( worker.timeout ) {
                timeout = setTimeout( function() {
                    if ( timeout ) {
                        reject( { error : { code : 9998, retry : 1, message : 'worker timeout' } } );
                    }
                }, ( worker.timeout * 1000 + 1000 ) );
            }

            if ( worker.handler ) {
                worker.handler( params || {}, task, resolve );
            }
            else if ( worker.module_handler ) {
                worker.module_handler( params, resolve, { task : task } );
            }
            else {
                console.log("ERROR: could not find handler to run for worker " + worker.name );
            }
        } );

        promise.then( function( result ) {
            if ( timeout ) {
                clearTimeout( timeout );
            }
            timeout = false;
            var result_json = JSON.stringify( result );
            log( start_date, 'OK', worker.name, params || {}, params ? '' : task.payload, result_json.length, result );

            delete running_jobs[ in_process_id ];
            task.end( result_json );
        }, function( error ) {
            if ( timeout ) {
                clearTimeout( timeout );
            }
            timeout = false;
            var error_json = '';
            if ( error && typeof error == 'object' && error.error ) {
                error_json = JSON.stringify( error );
            }
            else {
                error_json = JSON.stringify( { error : { code : 999, message : 'Unhandled error', dump : error } } );
            }
            log( start_date, 'ERROR', worker.name, params || {}, params ? '' : task.payload, error_json.length, error );

            delete running_jobs[ in_process_id ];
            task.end( error_json );
        } );
    };

    if ( ! argv.test_function ) {
        gearman_client.registerWorker( worker.name, worker.timeout ? { timeout: worker.timeout } : {}, wrapped_handler );
    }
    else if ( argv.test_function == worker.name ) {
        var task = { payload : argv.parameters };
        _.each( [ 'end', 'status', 'warn', 'error' ], function( type ) {
            task[ type ] = function() {
                console.log( " *** Task signaled \"" + type + "\"." );
            };
        } );
        wrapped_handler( task );
    }
} );

var process_closing = false;
var shutdown_timeout = false;

function shutdown_gracefully( ultimate_kill_timeout_seconds, reason ) {
    if ( process_closing ) {
        return;
    }
    process_closing = new Date();

    console.log("Shutting down gracefully because " + reason + " was issued..")

    if ( gearman_client ) {
        _.each( workers, function( worker ) {
            gearman_client.unregisterWorker( worker.name );
        } );
    }

    var ultimate_kill_timeout = setTimeout( function() {
        var running_job_count = Object.keys( running_jobs ).length;
        if ( running_job_count > 0 ) {
            console.log("WARNING: Exiting forcefully after waiting inflight workers for " + ultimate_kill_timeout_seconds + " seconds.")
            process.exit();
        }
    }, ultimate_kill_timeout_seconds * 1000 );

    var graceful_shutdown_inteval = setInterval( function() {
        var running_job_count = Object.keys( running_jobs ).length;
        if ( running_job_count == 0 ) {
            clearInterval( graceful_shutdown_inteval );
            if ( ultimate_kill_timeout ) {
                clearTimeout( ultimate_kill_timeout );
            }
            if ( shutdown_timeout ) {
                clearTimeout( shutdown_timeout );
            }
            if ( gearman_client ) {
                gearman_client.disconnect();
            }
        }
        else {
            console.log("Still waiting for graceful shutdown of " + running_job_count + " job(s).")
        }
    }, 1000 );
}

if ( argv.randomize_shutdown_timeout ) {
    var min = argv.randomize_shutdown_timeout_min || 60*15;
    var max = argv.randomize_shutdown_timeout_max || 60*30;
    argv.shutdown_timeout = ( Math.random() * (max - min) ) + min;
}

if ( argv.shutdown_timeout || argv.shutdown_timeout_millis ) {
    var ms = argv.shutdown_timeout ? argv.shutdown_timeout * 1000 : argv.shutdown_timeout_millis;
    shutdown_timeout = setTimeout( function() {
        shutdown_gracefully( 30, 'a shutdown timeout of ' + ms + ' ms' );
    }, ms );
}

['SIGTERM','SIGHUP','SIGQUIT'].forEach( function( signal ) {
    process.on( signal, function() {
        shutdown_gracefully( 30, signal );
    } );
} );

['SIGINT'].forEach( function( signal ) {
    process.on( signal, function() {
        shutdown_gracefully( 1, signal );
    } );
} );

if ( ! argv.test_function ) {
    console.log("Starting server..");
}
