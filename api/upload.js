
import { handleUpload } from '@vercel/blob/client';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body;

    const jsonResponse = await handleUpload({
      body,
      request: req,

      onBeforeGenerateToken: async (
        pathname,
        clientPayload
      ) => {
        const data = JSON.parse(clientPayload || '{}');

        if (data.pin !== process.env.CHOUJI_ADMIN_PIN) {
          throw new Error('PIN admin salah');
        }

        return {
          allowedContentTypes: [
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/gif',
            'video/mp4',
            'video/webm',
            'video/quicktime'
          ],
          maximumSizeInBytes: 5 * 1024 * 1024 * 1024,
          addRandomSuffix: true
        };
      },

      onUploadCompleted: async ({ blob }) => {
        console.log('Upload selesai:', blob.url);
      }
    });

    return res.status(200).json(jsonResponse);

  } catch (error) {
    return res.status(400).json({
      error: error.message
    });
  }
}
