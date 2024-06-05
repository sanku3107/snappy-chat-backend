import mongoose from "mongoose";

const verifySmsTokenSchema = new mongoose.Schema({
  _userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  token: {
    type: String,
    required: [true, "Please provide a valid token"],
  },
  expireAt: {
    type: Date,
    default: () => Date.now() + 86400000, // Set to expire in 24 hours
    index: { expires: '24h' },
  },
});

export const VerifySmsToken = mongoose.model("VerifySmsToken", verifySmsTokenSchema);
