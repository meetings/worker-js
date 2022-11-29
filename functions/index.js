var path = require('path');
var klaw_sync = require('klaw-sync')

module.exports = {
    find_workers : function() {
        var workers = [];

        var functions_dir = path.dirname( module.filename );
        var klaw_args = { nodir: true, ignore: '{node_modules,lib}' };

        var possible_function_modules = klaw_sync( functions_dir, klaw_args );

        possible_function_modules.forEach( function (item) {
            if ( ! /\.js$/.test( item.path ) ) {
                return;
            }

            var function_module;

            try {
                function_module = require( item.path );
            }
            catch (e) {
                console.log( 'Error while loading module ' + item.path );
            }

            var config = function_module.config || {};

            if ( ! config.name ) {
                config.name = /\/([^\/]*)\.js$/.exec( item.path )[1];
            }

            workers.push( {
                name : config.name,
                timeout : config.timeout,
                module_handler : function_module.handler,
            } )
        });

        return workers;
    }
};
