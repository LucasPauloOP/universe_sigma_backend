const uploads = require('../../controllers/uploadController');
const { scopedRouter } = require('../crud');

const router = scopedRouter();

// Upload de imagens (Neon Object Storage). Salve o `imageUrl` retornado.
router.post('/uploads', uploads.single, uploads.create);

module.exports = router;
