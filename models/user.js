const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },

    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },

    password: {
        type: String,
        required: true
    },

    role: {
        type: String,
        enum: ["user", "host", "admin"],
        default: "user"
    },
    hostRequestStatus: {
    type: String,
    enum: ["none", "pending", "rejected"],
    default: "none"
    },
}, {
    timestamps: true
});

const User = mongoose.model("User", userSchema);

module.exports = User;