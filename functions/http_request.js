var utils = require("../lib/utils.js");
var request = require('request');
var Promise = require("bluebird");

module.exports.config = { timeout : 200 };
module.exports.handler = function( params, resolve, context ) {
    var p = utils.validate_and_combine_params( params, {
        url : { required : 1 },
    } );

    if ( p.json ) {
        p.json = true;
    }

    request( p, function( err, obj, response ) {
        if ( err ) {
            return resolve( Promise.reject( { error : err } ) );
        }
        return resolve( { response : response } );
    } );
};
