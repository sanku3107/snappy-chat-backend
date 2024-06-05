import crypto from "crypto";
import cloudinary from "cloudinary";
import { config } from "dotenv";

import mailTransporter from "../config/mailTransporter.js";

import { User } from "../models/User.js";
import { VerifyEmailToken } from "../models/VerifyEmailToken.js";
import UnauthenticatedError from "../errors/unauthenticated.js";
import BadRequestError from "../errors/bad-request.js";
import NotFoundError from "../errors/not-found.js";
import ForbiddenRequestError from "../errors/forbidden-request.js";
import { OTP } from "../models/OTP.js";
import { VerifySmsToken } from "../models/VerifySmsToken.js";
import bcryptJs from "bcryptjs";
import twilio from "twilio";

config();

const signup = async (req, res) => {
  let { name, email, password, phoneNumber, avatar } = req.body;

  if (!name || !email || !password || !phoneNumber)
    throw new BadRequestError("Please Enter all The Required Fields");

  const userExists = await User.findOne({ email });
  if (userExists) throw new BadRequestError("User already exists");

  if (!avatar) {
    const myCloud = await cloudinary.v2.uploader.upload(
      process.env.DEFAULT_AVATAR,
      {
        folder: "Chat-App",
      }
    );
    req.body.avatar = {
      public_id: myCloud.public_id,
      url: myCloud.secure_url,
    };
  } else {
    const myCloud = await cloudinary.v2.uploader.upload(avatar, {
      folder: "Chat-App",
    });
    req.body.avatar = {
      public_id: myCloud.public_id,
      url: myCloud.secure_url,
    };
  }

  let user = await User.create({ ...req.body });

  if (!user) throw new Error(`Unable to create user.Please try again later!`);
  const token = user.createToken();
  user = user.toObject();
  delete user.password;
  res.status(201).json({ user, token });
};

const login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    throw new BadRequestError("please provide email and password both");
  }
  let user = await User.findOne({ email });
  if (!user) {
    throw new UnauthenticatedError("User doesn't exists");
  }

  // compare the password
  const isPasswordCorrect = await user.comparePassword(password);
  if (!isPasswordCorrect) {
    throw new UnauthenticatedError("Invalid Credentials (wrong Password)");
  }

  const token = user.createToken();
  user = user.toObject();
  delete user.password;
  res.status(200).json({ user, token });
};

const allUsers = async (req, res) => {
  const keyword = req.query.search
    ? {
        $or: [
          { name: { $regex: req.query.search, $options: "i" } },
          { email: { $regex: req.query.search, $options: "i" } },
        ],
      }
    : {};

  const users = await User.find(keyword).find({ _id: { $ne: req.user._id } });
  res.status(200).json({ totalUsers: users.length, users });
};

const sendVerificationEmail = async (req, res) => {
  const user = req.user;
  if (user.isVerifiedEmail)
    throw new BadRequestError(
      `User with Email:${user.email} is already verified`
    );
  await VerifyEmailToken.findOneAndRemove({ _userId: user._id });
  const token = await VerifyEmailToken.create({
    _userId: user._id,
    token: crypto.randomBytes(16).toString("hex"),
  });

  if (!token)
    throw new Error(
      "Unable to create Email verification link, Please try again later!"
    );
  const date = new Date(
    token.expireAt.getTime() + 86400000
  ).toLocaleDateString();
  const time = token.expireAt.toLocaleTimeString();

  const mailOptions = {
    from: process.env.ADMIN_EMAIL,
    to: user.email,
    subject: "Account Verification",
    html: `<h2>Hello ${user.name}</h2>
            <p>Please verify your account by clicking the link:</p>
            <span style="margin:0 10px 0 10px" >👉🏼</span><a href="http://${req.headers.host}/api/v1/user/verify/email/confirmation/${user.email}/${token.token}" target="_blank">Click Here</a><span style="margin:0 10px 0 10px" >👈🏼</span>
            <br>
            <p>This Link will be expired on <b>${date}</b> at <b>${time}</b></p>
            `,
  };
  mailTransporter.sendMail(mailOptions, (err, data) => {
    if (err) {
      res.status(500).json({ text: err.message });
    } else {
      res.status(200).json({
        text:
          "A verification email has been sent to " +
          user.email +
          `. Please Check Your Spam Folder and If you not get verification Email then click on resend token.`,
        expireAt: {
          date,
          time,
        },
      });
    }
  });
};

// ------------------------------------------------------------------------------------------------------------------------------//
const sendVerificationSms = async (req, res) => {
  const user = req.user;

  if (user.isVerifiedPhoneNumber) {
    return res.status(400).json({
      success: false,
      message: `User with Phone Number: ${user.phoneNumber} is already verified`,
    });
  }

  await VerifySmsToken.findOneAndRemove({ _userId: user._id });

  const token = await VerifySmsToken.create({
    _userId: user._id,
    token: crypto.randomBytes(16).toString("hex"),
  });

  if (!token) {
    return res.status(500).json({
      success: false,
      message:
        "Unable to create SMS verification link. Please try again later!",
    });
  }

  const date = new Date(token.expireAt).toLocaleDateString();
  const time = new Date(token.expireAt).toLocaleTimeString();

  const messageBody = `Hello ${user.name},\n\nPlease verify your account by clicking the link below:\n\nhttp://${req.headers.host}/api/v1/user/verify/sms/confirmation/${user.phoneNumber}/${token.token}\n\nThis link will expire on ${date} at ${time}.`;

  try {
    const twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    await twilioClient.messages.create({
      body: messageBody,
      to: user.phoneNumber,
      from: process.env.TWILIO_PHONE_NUMBER,
    });

    return res.status(200).json({
      success: true,
      message: `Verification link sent to ${user.phoneNumber} successfully!`,
      expireAt: {
        date,
        time,
      },
    });
  } catch (error) {
    console.error("Twilio error:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const reSendVerificationSms = async (req, res) => {
  const user = req.user;
  if (user.isVerifiedPhoneNumber)
    throw new BadRequestError(
      `User with Phone Number:${user.phoneNumber} is already verified`
    );
  var token = await VerifySmsToken.findOne(user._id);
  if (!token) {
    token = await VerifySmsToken.create({
      _userId: user._id,
      token: crypto.randomBytes(16).toString("hex"),
    });
  }

  if (!token)
    throw new Error(
      "Unable to create Phone Number verification link, Please try again later!"
    );

  const date = new Date(token.expireAt).toLocaleDateString();
  const time = new Date(token.expireAt).toLocaleTimeString();

  const messageBody = `Hello ${user.name},\n\nPlease verify your account by clicking the link below:\n\nhttp://${req.headers.host}/api/v1/user/verify/sms/confirmation/${user.phoneNumber}/${token.token}\n\nThis link will expire on ${date} at ${time}.`;

  try {
    const twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    await twilioClient.messages.create({
      body: messageBody,
      to: user.phoneNumber,
      from: process.env.TWILIO_PHONE_NUMBER,
    });

    return res.status(200).json({
      success: true,
      message: `Verification link sent to ${user.phoneNumber} successfully!`,
      expireAt: {
        date,
        time,
      },
    });
  } catch (error) {
    console.error("Twilio error:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const confirmVerificationSms = async (req, res) => {
  const token = await VerifySmsToken.findOne({ token: req.params.token });
  if (!token)
    throw new BadRequestError(
      `This link is Note Valid. Verification link may have expired.`
    );

  let user = await User.findById(token._userId);

  if (!user) throw new UnauthenticatedError();

  if (user.isVerifiedPhoneNumber)
    throw new BadRequestError(
      `User with Email:${user.phoneNumber} is already verified`
    );

  user.isVerifiedPhoneNumber = true;
  user.save((err, user) => {
    if (err) return new Error(`Unable to verify user`);
  });

  await VerifySmsToken.findOneAndRemove({ _userId: user._id });

  res.status(200).json({ text: "Your account has been successfully verified" });
};

// ------------------------------------------------------------------------------------------------------------------------------//

const reSendVerificationEmail = async (req, res) => {
  const user = req.user;
  if (user.isVerifiedEmail)
    throw new BadRequestError(
      `User with Email:${user.email} is already verified`
    );
  var token = await VerifyEmailToken.findOne(user._id);
  if (!token) {
    token = await VerifyEmailToken.create({
      _userId: user._id,
      token: crypto.randomBytes(16).toString("hex"),
    });
  }

  if (!token)
    throw new Error(
      "Unable to create Email verification link, Please try again later!"
    );
  const date = new Date(
    token.expireAt.getTime() + 86400000
  ).toLocaleDateString();
  const time = token.expireAt.toLocaleTimeString();

  const mailOptions = {
    from: process.env.ADMIN_EMAIL,
    to: user.email,
    subject: "Account Verification",
    html: `<h2>Hello ${user.name}</h2>
            <p>Please verify your account by clicking the link:</p>
            <span style="margin:0 10px 0 10px" >👉🏼</span><a href="http://${req.headers.host}/api/v1/user/verify/email/confirmation/${user.email}/${token.token}" target="_blank">Click Here</a><span style="margin:0 10px 0 10px" >👈🏼</span>
            <br>
            <p>This Link will be expired on <b>${date}</b> at <b>${time}</b></p>
            `,
  };

  mailTransporter.sendMail(mailOptions, (err, data) => {
    if (err) {
      res.status(500).json({ text: err.message });
    } else {
      res.status(200).json({
        text:
          "A verification email has been sent to " +
          user.email +
          `. Please Check Your Spam Folder and If you not get verification Email then click on resend token.`,
        expireAt: {
          date,
          time,
        },
      });
    }
  });
};

const confirmVerificationEmail = async (req, res) => {
  const token = await VerifyEmailToken.findOne({ token: req.params.token });
  if (!token)
    throw new BadRequestError(
      `This link is Note Valid. Verification link may have expired.`
    );

  let user = await User.findById(token._userId);

  if (!user) throw new UnauthenticatedError();

  if (user.isVerifiedEmail)
    throw new BadRequestError(
      `User with Email:${user.email} is already verified`
    );

  user.isVerifiedEmail = true;
  user.save((err, user) => {
    if (err) return new Error(`Unable to verify user`);
  });

  await VerifyEmailToken.findOneAndRemove({ _userId: user._id });

  res.status(200).json({ text: "Your account has been successfully verified" });
};

// const sendForgotPasswordOtp = async (req, res) => {
//   const { email } = req.body;
//   const user = await User.findOne({ email });
//   if (!user) throw new NotFoundError(`User with email ${email} doesn't exist`);
//   if (!user.isVerifiedEmail)
//     throw new ForbiddenRequestError(
//       `User isn't verified yet. To change your forgotten password, please verify your email first!`
//     );

//   const data = {
//     _userId: user._id,
//     token: Math.floor(100000 + Math.random() * 900000),
//   };

//   await OTP.findOneAndRemove({ _userId: user._id });
//   const otp = await OTP.create(data);
//   if (!otp) throw new Error(`Unable to generate OTP.Please try again later!`);

//   const date = new Date(
//     new Date(otp.expireAt).getTime() + 7200000
//   ).toLocaleDateString();
//   const time = new Date(
//     new Date(otp.expireAt).getTime() + 7200000
//   ).toLocaleTimeString();

//   const mailOptions = {
//     from: process.env.ADMIN_EMAIL,
//     to: user.email,
//     subject: "Forgot Password",
//     html: `<h2>Hello ${user.name}</h2>
//         <p>Here is your (ONE TIME PASSWORD)OTP to change your forgotten password:</p>
//         <span style="margin:0 10px 0 10px" >👉🏼</span><b style="letter-spacing: 2px;">${otp.token}</b><span style="margin:0 10px 0 10px" >👈🏼</span>
//         <br>
//         <p>This token will be expired on <b>${date}</b> at <b>${time}</b></p>
//         `,
//   };

//   mailTransporter.sendMail(mailOptions, (err, data) => {
//     if (err) {
//       res.status(500).json({ text: err.message });
//     } else {
//       res.status(200).json({
//         text: `One time password has been sent Successfully!. Please Check Your Spam Folder and If you not get otp then click on resend otp.`,
//         expireAt: {
//           date,
//           time,
//         },
//         email,
//       });
//     }
//   });
// };

const sendForgotPasswordOtp = async (req, res) => {
  try {
    const { email } = req.body;
    // console.log("Received request to send OTP to email:", email);

    const user = await User.findOne({ email });
    if (!user) {
      // console.log(`User with email ${email} doesn't exist`);
      throw new NotFoundError(`User with email ${email} doesn't exist`);
    }

    if (!user.isVerifiedEmail) {
      // console.log(`User with email ${email} isn't verified yet.`);
      throw new ForbiddenRequestError(
        `User isn't verified yet. To change your forgotten password, please verify your email first!`
      );
    }

    const data = {
      _userId: user._id,
      token: Math.floor(100000 + Math.random() * 900000),
    };

    // console.log("Removing old OTP if it exists for user ID:", user._id);
    await OTP.findOneAndRemove({ _userId: user._id });

    // console.log("Creating new OTP for user ID:", user._id);
    const otp = await OTP.create(data);
    if (!otp) {
      // console.log("Failed to create OTP for user ID:", user._id);
      throw new Error(`Unable to generate OTP. Please try again later!`);
    }

    const date = new Date(
      new Date(otp.expireAt).getTime() + 7200000
    ).toLocaleDateString();
    const time = new Date(
      new Date(otp.expireAt).getTime() + 7200000
    ).toLocaleTimeString();

    const mailOptions = {
      from: process.env.ADMIN_EMAIL,
      to: user.email,
      subject: "Forgot Password",
      html: `<h2>Hello ${user.name}</h2>
          <p>Here is your (ONE TIME PASSWORD)OTP to change your forgotten password:</p>
          <span style="margin:0 10px 0 10px" >👉🏼</span><b style="letter-spacing: 2px;">${otp.token}</b><span style="margin:0 10px 0 10px" >👈🏼</span>
          <br>
          <p>This token will be expired on <b>${date}</b> at <b>${time}</b></p>
          `,
    };

    // console.log("Sending email to:", user.email);
    mailTransporter.sendMail(mailOptions, (err, data) => {
      if (err) {
        // console.log("Error sending email:", err.message);
        res.status(500).json({ text: err.message });
      } else {
        res.status(200).json({
          text: `One time password has been sent Successfully!. Please Check Your Spam Folder and If you not get otp then click on resend otp.`,
          expireAt: {
            date,
            time,
          },
          email,
        });
      }
    });
  } catch (error) {
    // console.error("Error in sendForgotPasswordOtp:", error);
    res.status(500).json({ msg: { text: error.message } });
  }
};

const reSendForgotPasswordOtp = async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) throw new NotFoundError(`User with email ${email} doesn't exist`);
  if (!user.isVerifiedEmail)
    throw new ForbiddenRequestError(
      `User isn't verified yet. To change your forgotten password, please verify your email first!`
    );

  const data = {
    _userId: user._id,
    token: Math.floor(100000 + Math.random() * 900000),
  };

  var otp = await OTP.findOne({ _userId: user._id });
  if (!otp) otp = await OTP.create(data);
  if (!otp) throw new Error(`Unable to generate OTP.Please try again later!`);
  const date = new Date(
    new Date(otp.expireAt).getTime() + 7200000
  ).toLocaleDateString();
  const time = new Date(
    new Date(otp.expireAt).getTime() + 7200000
  ).toLocaleTimeString();

  const mailOptions = {
    from: process.env.ADMIN_EMAIL,
    to: user.email,
    subject: "Forgot Password",
    html: `<h2>Hello ${user.name}</h2>
        <p>Here is your (ONE TIME PASSWORD)OTP to change your forgotten password:</p>
        <span style="margin:0 10px 0 10px" >👉🏼</span><b style="letter-spacing: 2px;">${otp.token}</b><span style="margin:0 10px 0 10px" >👈🏼</span>
        <br>
        <p>This token will be expired on <b>${date}</b> at <b>${time}</b></p>
        `,
  };

  mailTransporter.sendMail(mailOptions, (err, data) => {
    if (err) {
      res.status(500).json({ text: err.message });
    } else {
      res.status(200).json({
        text: `One time password has been sent Successfully!. Please Check Your Spam Folder and If you not get otp then click on resend otp.`,
        expireAt: {
          date,
          time,
        },
        email,
      });
    }
  });
};

const verifyForgotPasswordOtpBeforeLogin = async (req, res) => {
  const { token, email, password } = req.body;
  if (!token) throw new BadRequestError("Please Provide token");
  if (!email || !password)
    throw new BadRequestError("Please Provide email and password");

  var user = await User.findOne({ email });
  if (!user) throw new NotFoundError(`User with email ${email} doesn't exist`);
  if (!user.isVerifiedEmail)
    throw new ForbiddenRequestError(
      `User isn't verified yet. To change your forgotten password, please verify your email first!`
    );
  const otp = await OTP.findOne({
    token,
    _userId: user._id,
  });
  if (!otp)
    throw new BadRequestError(
      "This OTP is Not Valid. Your OTP may have expired."
    );

  user.password = password;
  user.save((err, user) => {
    if (err)
      return new Error(`Unable to change user's password to ${password}`);
  });
  await OTP.findOneAndRemove({ _userId: user._id });
  res.status(200).json({
    text: "Password changed successfully",
  });
};

//---------------------------------------------------------------------------------------------------
const sendForgotPasswordOtpViaSms = async (req, res) => {
  const { phoneNumber } = req.body;
  const user = await User.findOne({ phoneNumber });
  if (!user)
    throw new NotFoundError(
      `User with Phone Number ${phoneNumber} doesn't exist`
    );
  if (!user.isVerifiedPhoneNumber)
    throw new ForbiddenRequestError(
      `User isn't verified yet. To change your forgotten password, please verify your Phone Number first!`
    );

  const data = {
    _userId: user._id,
    token: Math.floor(100000 + Math.random() * 900000),
  };

  await OTP.findOneAndRemove({ _userId: user._id });
  const otp = await OTP.create(data);
  if (!otp) throw new Error(`Unable to generate OTP.Please try again later!`);

  const date = new Date(
    new Date(otp.expireAt).getTime() + 7200000
  ).toLocaleDateString();
  const time = new Date(
    new Date(otp.expireAt).getTime() + 7200000
  ).toLocaleTimeString();

  const messageBody = `Hello ${user.name},\n\nHere is your (ONE TIME PASSWORD) OTP to change your forgotten password:\n\n${otp.token}\n\nThis link will expire on ${date} at ${time}.`;
  try {
    const twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    await twilioClient.messages.create({
      body: messageBody,
      to: user.phoneNumber,
      from: process.env.TWILIO_PHONE_NUMBER,
    });

    return res.status(200).json({
      success: true,
      message: `OTP sent to ${user.phoneNumber} successfully!`,
      expireAt: {
        date,
        time,
      },
      phoneNumber,
    });
  } catch (error) {
    console.error("Twilio error:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const reSendForgotPasswordOtpViaSms = async (req, res) => {
  const { phoneNumber } = req.body;
  const user = await User.findOne({ phoneNumber });
  if (!user)
    throw new NotFoundError(
      `User with Phone Number ${phoneNumber} doesn't exist`
    );
  if (!user.isVerifiedPhoneNumber)
    throw new ForbiddenRequestError(
      `User isn't verified yet. To change your forgotten password, please verify your Phone Number first!`
    );

  const data = {
    _userId: user._id,
    token: Math.floor(100000 + Math.random() * 900000),
  };

  var otp = await OTP.findOne({ _userId: user._id });
  if (!otp) otp = await OTP.create(data);
  if (!otp) throw new Error(`Unable to generate OTP.Please try again later!`);

  const date = new Date(
    new Date(otp.expireAt).getTime() + 7200000
  ).toLocaleDateString();
  const time = new Date(
    new Date(otp.expireAt).getTime() + 7200000
  ).toLocaleTimeString();

  const messageBody = `Hello ${user.name},\n\nHere is your (ONE TIME PASSWORD) OTP to change your forgotten password:\n\n${otp.token}\n\nThis link will expire on ${date} at ${time}.`;
  try {
    const twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    await twilioClient.messages.create({
      body: messageBody,
      to: user.phoneNumber,
      from: process.env.TWILIO_PHONE_NUMBER,
    });

    return res.status(200).json({
      success: true,
      message: `OTP sent to ${user.phoneNumber} successfully!`,
      expireAt: {
        date,
        time,
      },
      phoneNumber,
    });
  } catch (error) {
    console.error("Twilio error:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const verifyForgotPasswordOtpAfterLogin = async (req, res) => {
  try {
    // Extract necessary data from the request body
    const { email, token, phoneNumber, password, newPassword } = req.body;

    if (token) {
      // reset using OTP
      const user = await User.findOne({ $or: [{ email }, { phoneNumber }] });
      if (!user) {
        console.error("User not found");
        throw new NotFoundError(
          `User with email ${email} or ${phoneNumber} doesn't exist`
        );
      }
      // Check if user's email or phone number is verified
      if (!user.isVerifiedEmail || !user.isVerifiedPhoneNumber) {
        console.error("User is not verified");
        throw new ForbiddenRequestError(
          `User isn't verified yet. To change your forgotten password, please verify your email or phone number first!`
        );
      }
      const otp = await OTP.findOne({
        token,
        _userId: user._id,
      });
      if (!otp) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid OTP or Expired" });
      }

      user.password = newPassword;
      user.save((err, user) => {
        if (err)
          return new Error(
            `Unable to change user's password to ${newPassword}`
          );
      });
      await OTP.findOneAndRemove({ _userId: user._id });
      res
        .status(200)
        .json({ success: true, message: "Password changed successfully" });
    } else {
      // Check if password is provided and reset
      if (!password)
        throw new BadRequestError("Please Provide the current password");

      // Find the user by email or phone number
      const user = await User.findOne({ $or: [{ email }, { phoneNumber }] });
      // console.log("User found:", user);
      // If user not found, return an error
      if (!user) {
        // console.error("User not found");
        throw new NotFoundError(
          `User with email ${email} or ${phoneNumber} doesn't exist`
        );
      }
      // Check if user's email or phone number is verified
      if (!user.isVerifiedEmail || !user.isVerifiedPhoneNumber) {
        // console.error("User is not verified");
        throw new ForbiddenRequestError(
          `User isn't verified yet. To change your forgotten password, please verify your email or phone number first!`
        );
      }
      // Check if the current password matches the stored password
      const isPasswordValid = await bcryptJs.compare(password, user.password);
      // console.log("Password validation result:", isPasswordValid);
      if (!isPasswordValid) {
        // console.error("Invalid password");
        return res
          .status(400)
          .json({ success: false, message: "Invalid password" });
      }

      user.password = newPassword;

      // Save the updated user object
      await user.save();
      // console.log("User password updated");
      return res
        .status(200)
        .json({ success: true, message: "Password changed successfully" });
    }
  } catch (error) {
    // If an error occurs, return an error response
    console.error("Error changing password:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

//---------------------------------------------------------------------------------------------------
const updateAvatar = async (req, res) => {
  var { avatar } = req.body;
  if (!avatar.public_id)
    throw new BadRequestError("Please Provide avatar public_id");
  if (!avatar.url) throw new BadRequestError("Please Provide avatar data url");

  const { result } = await cloudinary.v2.uploader.destroy(avatar.public_id);
  if (result === "not found")
    throw new BadRequestError("Please provide correct public_id");
  if (result !== "ok")
    throw new Error(
      "Unable to update user Avatar, The public_id might not exist in database."
    );

  const myCloud = await cloudinary.v2.uploader.upload(avatar.url, {
    public_id: avatar.public_id,
  });
  avatar = {
    public_id: myCloud.public_id,
    url: myCloud.secure_url,
  };

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { avatar },
    { runValidators: true, new: true }
  );

  if (!user) throw new Error("Unable to update user Avatar, Try again later");
  res.status(200).json({
    avatar: user.avatar,
    status: "success",
    text: "User's Avatar update successfully!",
  });
};

const updateName = async (req, res) => {
  const { name } = req.body;
  if (!name) throw new BadRequestError("Please Provide new Name");
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { name },
    { new: true }
  );

  if (!user) throw new Error("Unable to update User's Name, Try again later");

  res.status(200).json({
    name: user.name,
    status: "success",
    text: "User's Name update successfully!",
  });
};

const updateEmail = async (req, res) => {
  const { email } = req.body;
  if (!email) throw new BadRequestError("Please Provide new Email");
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { email, isVerifiedEmail: false },
    { new: true }
  );

  if (!user) throw new Error("Unable to update user Email, Try again later");

  res.status(200).json({
    email: user.email,
    isVerifiedEmail: user.isVerifiedEmail,
    status: "success",
    text: "User's Email update successfully!",
  });
};

const updatePhoneNumber = async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) throw new BadRequestError("Please Provide new PhoneNumber");
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { phoneNumber, isVerifiedPhoneNumber: false },
    { new: true }
  );

  if (!user)
    throw new Error("Unable to update user PhoneNumber, Try again later");

  res.status(200).json({
    phoneNumber: user.phoneNumber,
    isVerifiedPhoneNumber: user.isVerifiedPhoneNumber,
    status: "success",
    text: "User's Phone-Number update successfully!",
  });
};

export {
  signup,
  login,
  allUsers,
  sendVerificationEmail,
  sendVerificationSms, //added
  reSendVerificationSms, //added
  confirmVerificationSms, //added
  confirmVerificationEmail,
  reSendVerificationEmail,
  sendForgotPasswordOtp,
  verifyForgotPasswordOtpBeforeLogin, //added
  reSendForgotPasswordOtp,
  sendForgotPasswordOtpViaSms, //added
  verifyForgotPasswordOtpAfterLogin, //added
  reSendForgotPasswordOtpViaSms, //added
  updateAvatar,
  updateName,
  updateEmail,
  updatePhoneNumber,
};
