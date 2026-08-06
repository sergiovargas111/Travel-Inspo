import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

const s3 = new S3Client({});

export const handler = async (event) => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

    if (!key.startsWith('originals/')) continue;

    const thumbnailKey = key.replace('originals/', 'thumbnails/');

    const original = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const originalBuffer = Buffer.from(await original.Body.transformToByteArray());

    const thumbnailBuffer = await sharp(originalBuffer)
      .resize({ width: 300 })
      .toBuffer();

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: thumbnailKey,
        Body: thumbnailBuffer,
        ContentType: original.ContentType ?? 'image/jpeg',
      })
    );

    console.log(`Thumbnail written: ${thumbnailKey}`);
  }
};
