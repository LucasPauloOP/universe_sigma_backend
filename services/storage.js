// Neon Object Storage (compatível com S3). Credenciais, endpoint e região vêm
// das variáveis AWS_* injetadas pela Neon (.env.local).
const { randomUUID } = require('crypto');
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const BUCKET = process.env.STORAGE_BUCKET || 'assets';
const PREFIX = 'storage:'; // como a chave fica guardada nas colunas imageUrl
const EXPIRES_IN = 60 * 60; // 1h

const EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

let client;
const s3 = () => {
  // forcePathStyle é obrigatório na Neon (endereçamento por path).
  client ??= new S3Client({ forcePathStyle: true });
  return client;
};

const isStorageRef = (v) => typeof v === 'string' && v.startsWith(PREFIX);

async function uploadImage(universeId, buffer, contentType) {
  const key = `${universeId}/${randomUUID()}.${EXT[contentType]}`;
  await s3().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );
  return { key, ref: PREFIX + key };
}

// URL assinada do nosso bucket -> "storage:<chave>" (ex.: copiar a imagem de
// outro registro). Qualquer outra URL passa sem alteração.
function toStorageRef(url) {
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return url;
  try {
    const { pathname, searchParams } = new URL(url);
    if (!searchParams.has('X-Amz-Signature')) return url;
    const path = decodeURIComponent(pathname).replace(/^\//, '');
    const key = path.startsWith(`${BUCKET}/`)
      ? path.slice(BUCKET.length + 1)
      : path;
    return PREFIX + key;
  } catch {
    return url;
  }
}

const presign = (key) =>
  getSignedUrl(s3(), new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
    expiresIn: EXPIRES_IN,
  });

const remove = (key) =>
  s3().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));

// Percorre uma resposta e troca `imageUrl: "storage:<chave>"` por uma URL
// assinada (o bucket é privado). URLs externas passam sem alteração.
async function resolveImages(node) {
  if (Array.isArray(node)) {
    await Promise.all(node.map(resolveImages));
  } else if (node && typeof node === 'object' && !(node instanceof Date)) {
    await Promise.all(
      Object.keys(node).map(async (k) => {
        if (k === 'imageUrl' && isStorageRef(node[k])) {
          node[k] = await presign(node[k].slice(PREFIX.length));
        } else {
          await resolveImages(node[k]);
        }
      }),
    );
  }
  return node;
}

module.exports = {
  BUCKET,
  PREFIX,
  EXT,
  isStorageRef,
  toStorageRef,
  uploadImage,
  presign,
  remove,
  resolveImages,
};
