import jwt from "jsonwebtoken";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "../config/awsConfig.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";

async function getImageUrl(key) {
  if (!key) return null;
  const cleanedKey = key.replace(/^https?:\/\/[^/]+\/[^/]+\//, "");
  const command = new GetObjectCommand({
    Bucket: "deligo.image",
    Key: cleanedKey,
  });
  return await getSignedUrl(s3, command, { expiresIn: 3600 });
}

export const adminCookie = async (jwt_secret, user, res, message) => {
  try {
    const expiresIn = 30 * 24 * 60 * 60 * 1000; 
  
    const token = jwt.sign(
      { id: user.id, email: user.email },
      jwt_secret,
      { expiresIn: "30d" }
    );

    const expiresAt = new Date(Date.now() + expiresIn);
    
    const profileImageUrl = await getImageUrl(user.profile_picture);

    const firstName = user.first_name || "";
    const lastName = user.last_name || "";
    const fullName = `${firstName} ${lastName}`.trim();
 
    res
      .status(200)
      .cookie("admin_token", token, {
        httpOnly: true,
        maxAge: expiresIn,
        sameSite: "none",
        secure: true,
      })
      .json({
        status: true,
        message,
        user: {
          role: user.role_id || "",
          userid: user.id || "",
          profileimage: profileImageUrl || "",
          prefix: user.prefix || "",
          fmname: firstName,
          lmname: lastName,
          fullname: fullName,
          you_are_here: user.you_are_here || "",
          email: user.email || "",
          mobile: user.mobile || "",
          address_name: user.address_name || "",
          setcurrentcategory: "0",
          token,
          token_expires_at: expiresAt.toISOString(),
        },
      });
  } catch (error) {
    console.error("Cookie Error:", error.message);
    res.status(500).json({ status: false, message: "Error generating token" });
  }
};
