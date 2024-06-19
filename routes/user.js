import express from "express";
import {
  allUsers,
  login,
  signup,
  sendVerificationEmail,
  confirmVerificationEmail,
  reSendVerificationEmail,
  sendForgotPasswordOtp,
  verifyForgotPasswordOtpBeforeLogin,
  reSendForgotPasswordOtp,
  updateAvatar,
  updateName,
  updateEmail,
  updatePhoneNumber,
  sendVerificationSms,
  confirmVerificationSms,
  reSendVerificationSms,
  sendForgotPasswordOtpViaSms,
  reSendForgotPasswordOtpViaSms,
  verifyForgotPasswordOtpAfterLogin,
  sendForgotPasswordOtpForNotVerifiedEmail,
  reSendForgotPasswordOtpForNotVerifiedEmail,
} from "../controllers/user.js";
import authenticateUser from "../middlewares/authentication.js";
const router = express.Router();

router.route("/login").post(login);
router.post("/signup", signup);

// {routes for verification of Email}-----------------------------------------
router.post("/verify/email/send", authenticateUser, sendVerificationEmail);
router.post("/verify/email/resend", authenticateUser, reSendVerificationEmail);
router.get(
  "/verify/email/confirmation/:email/:token",
  confirmVerificationEmail
)
//------------------------------------------------------------------------------------

// {routes for verification of Phone number}-----------------------------------------
router.post("/verify/phoneno/send", authenticateUser, sendVerificationSms);
router.post("/verify/phoneno/resend", authenticateUser, reSendVerificationSms);
router.get(
  "/verify/sms/confirmation/:phoneNumber/:token",
  confirmVerificationSms
)
//------------------------------------------------------------------------------------

// {reset password using OTP via email}
router.post("/password/reset/email/send", sendForgotPasswordOtp);
router.post("/password/reset/email/resend", reSendForgotPasswordOtp);

// {for forgot password page}
router.post("/password/reset/email/nverify/send", sendForgotPasswordOtpForNotVerifiedEmail);
router.post("/password/reset/email/nverify/resend", reSendForgotPasswordOtpForNotVerifiedEmail);

//------------------------------------------------------------------------------------
router.post("/password/reset/verify/beforeLogin", verifyForgotPasswordOtpBeforeLogin);
//------------------------------------------------------------------------------------

// {reset password using OTP via Phone number}
router.post("/password/reset/phoneno/send", sendForgotPasswordOtpViaSms);
router.post("/password/reset/phoneno/resend", reSendForgotPasswordOtpViaSms);
//-------------------------------------------------------------------------------------
router.post("/password/reset/verify/afterLogin", verifyForgotPasswordOtpAfterLogin);
//------------------------------------------------------------------------------------

router.get("/allUsers", authenticateUser, allUsers);
router.patch("/update/avatar", authenticateUser, updateAvatar);
router.patch("/update/name", authenticateUser, updateName);
router.patch("/update/email", authenticateUser, updateEmail);
router.patch("/update/phoneNumber", authenticateUser, updatePhoneNumber);

export default router;
