import { upload } from '@vercel/blob/client';

window.uploadChoujiMedia = async function (file, pin, onProgress) {
  if (!file) throw new Error('File belum dipilih');

  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ];

  if (!allowedTypes.includes(file.type)) {
    throw new Error('Format file tidak didukung');
  }

  const result = await upload(file.name, file, {
    access: 'public',
    handleUploadUrl: '/api/upload',
    multipart: true,
    clientPayload: JSON.stringify({ pin }),

    onUploadProgress: (event) => {
      if (onProgress) {
        onProgress(event.percentage);
      }
    }
  });

  return result.url;
};

