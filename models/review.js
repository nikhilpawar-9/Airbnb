const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema({
    rating: {
        type: Number,
        min: 1,
        max: 5,
        required: true
    },

    comment: {
        type: String,
        required: true
    },

    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    
    listing: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Listing",
    required: true
    }
}, { timestamps: true    
});

const Review = mongoose.model("Review", reviewSchema);

module.exports = Review;