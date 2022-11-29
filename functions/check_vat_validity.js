var utils = require("../lib/utils.js");
var validate_vat = require('validate-vat');
var Promise = require("bluebird");

module.exports.config = { timeout : 10 };
module.exports.handler = function( params, resolve, context ) {
    var p = utils.validate_and_combine_params( params, {
        country_code : { required : 1, regex_validate : /^\w\w$/ },
        vat_number : { required : 1, regex_validate : /^[\w\ \*\+]+$/ },
    } );

    if ( ! p.country_code || ! p.vat_number ) {
        return resolve( Promise.reject( { error : { code : 1, message : "invalid parameters" } } ) );
    }
    validate_vat( p.country_code, p.vat_number, function( err, validation_info ) {
        if ( ! err && validation_info && validation_info.valid ) {
            return resolve( { result : 1 } );
        }
        if ( ! err && validation_info ) {
            return resolve( { result : 0 } );
        }
        return resolve( Promise.reject( { error : { code : 1, retry : 1, message : utils.neat_inspect( err ) } } ) );
    } );
};
