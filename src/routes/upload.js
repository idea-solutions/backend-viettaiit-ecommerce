const router = require("express").Router();
const upload = require("../controllers/uploadController");
const { uploadSingle, uploadMultiple } = require("../helpers/uploadHelper");
router.post("/single", uploadSingle, upload.uploadSingle);
router.post("/multiple", uploadMultiple, upload.uploadMultiple);

module.exports = router;
