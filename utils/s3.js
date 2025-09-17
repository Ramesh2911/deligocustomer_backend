import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "../config/awsConfig.js";

export const uploadToS3 = async (fileContent, fileName, mimetype, folder) => {
  const key = `${folder}${Date.now()}_${fileName}`;

  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
    Body: fileContent,
    ContentType: mimetype,
  });

  await s3.send(command);
  return key; 
};
