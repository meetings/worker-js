var _ = require('underscore');
var util = require('util');

module.exports = utils = {
    neat_inspect : function( data ) {
        var string = util.inspect( data, { depth : 9 } );
        return string.replace(/ *\n */g, ' ', 'gm' );
    },
    validate_and_combine_params : function( input, defaults ) {
        if ( ! input || typeof input != 'object' ) {
            throw { error : { code : 1001, message : "Not a parameter object: " + utils.neat_inspect( input ) } };
        }
        if ( ! defaults || typeof defaults != 'object' ) {
            throw { error : { code : 1002, message : "Parameter defaults not passed in properly: " + utils.neat_inspect( defaults ) } };
        }
        _.each( defaults, function( default_value, default_key ) {
            if ( default_value && ( typeof default_value == 'object' ) ) {
                if ( default_value.required && ! input.hasOwnProperty( default_key ) ) {
                    throw { error : { code : 1003, message : "Required parameter missing: " + default_key } };
                }
                if ( default_value.regex_validate ) {
                    var value = String( input[ default_key ] );
                    if ( ! value.match( default_value.regex_validate ) ) {
                        throw { error : { code : 1004, message : "Parameter " + default_key + " did not pass validation " + default_value.regex_validate } };
                    }
                }
                if ( default_value.require_true ) {
                    if ( ! input[ default_key ] ) {
                        throw { error : { code : 1005, message : "Parameter " + default_key + " did not evaluate as true." } };
                    }
                }
            }
        } );

        return _.extend( {}, defaults, input );
    }
};
