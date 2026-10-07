const joi = require("joi");

const listingSchema = joi.object({
    listing: joi.object({
        title: joi.string().required(),
        description: joi.string().required(),
        price: joi.number().required().min(0),
        maxGuests: joi.number().integer().min(1).required(),
        location: joi.string().required(),
        country: joi.string().required(),
        image: joi.object({
        filename: joi.string().allow("", null),
        url: joi.string().allow("", null)
}).allow(null)
    }).required()
});

module.exports = {
    listingSchema
};