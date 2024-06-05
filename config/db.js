// import mongoose from "mongoose";
// mongoose.set("runValidators", true);
// const connectDB = (url) => {
//   return mongoose.connect(url, {
//     useNewUrlParser: true,
//     useUnifiedTopology: true,
//   });
// };

// export default connectDB;

import mongoose from "mongoose";
mongoose.set("runValidators", true);

const connectDB = async (url) => {
  try {
    const connection = await mongoose.connect(url, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      tls: true,
    });
    return connection;
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1); // Exit process with failure
  }
};

export default connectDB;


