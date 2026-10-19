const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username:{
        type: String,
        required: true,
        unique: [true, "Username already exists"]
    },
    email:{
        type: String,
        required: true,
        unique: [true, "Email already exists"],
    },
    password:{
        type: String,
        required: true,
    },
    fingerprintSecret:{
        type: String,
        default: () => require('crypto').randomBytes(32).toString('hex')
    }
}, { timestamps: true });

const UserModel = mongoose.model('User', userSchema);

module.exports = { UserModel };