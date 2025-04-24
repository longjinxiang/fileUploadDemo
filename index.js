const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const port = 3000;

app.use(express.static('public'));

// 启用CORS
app.use(cors());

// 解析JSON请求体
app.use(express.json());

// 文件上传临时目录
const UPLOAD_DIR = path.resolve(__dirname, 'uploads/temp');
// 最终文件存储目录
const FINAL_DIR = path.resolve(__dirname, 'uploads/final');

// 确保目录存在
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(FINAL_DIR)) {
  fs.mkdirSync(FINAL_DIR, { recursive: true });
}

// 配置multer用于文件上传
const upload = multer({ dest: UPLOAD_DIR });

/**
 * 检查已上传的分片
 */
app.post('/api/check-upload', (req, res) => {
  const { fileName, fileHash, chunkSize } = req.body;

  // 根据文件哈希创建临时目录
  const chunkDir = path.resolve(UPLOAD_DIR, fileHash);

  let uploadedChunks = 0;

  // 检查临时目录是否存在
  if (fs.existsSync(chunkDir)) {
    // 获取已上传的分片文件
    const chunks = fs.readdirSync(chunkDir);
    uploadedChunks = chunks.length;
  }

  res.json({
    uploadedChunks,
    chunkSize: parseInt(chunkSize)
  });
});

/**
 * 上传文件分片
 */
app.post('/api/upload', upload.single('file'), (req, res) => {
  const { fileName, fileHash, chunkIndex, totalChunks } = req.body;

  // 验证必要参数
  if (!fileName || !fileHash || !chunkIndex || !totalChunks) {
    return res.status(400).json({ error: '缺少必要参数' });
  }

  // 获取上传的临时文件
  const tempFile = req.file;
  if (!tempFile) {
    return res.status(400).json({ error: '未接收到文件' });
  }

  // 创建以文件哈希命名的临时目录
  const chunkDir = path.resolve(UPLOAD_DIR, fileHash);
  if (!fs.existsSync(chunkDir)) {
    fs.mkdirSync(chunkDir);
  }

  // 将临时文件移动到分片目录
  const chunkPath = path.resolve(chunkDir, chunkIndex);
  fs.renameSync(tempFile.path, chunkPath);

  res.json({
    success: true,
    chunkIndex: parseInt(chunkIndex)
  });
});

/**
 * 合并文件分片
 */
app.post('/api/merge', async (req, res) => {
  const { fileName, fileHash, totalChunks, chunkSize, fileSize } = req.body;

  // 验证必要参数
  if (!fileName || !fileHash || !totalChunks || !chunkSize || !fileSize) {
    return res.status(400).json({ error: '缺少必要参数' });
  }

  // 分片目录
  const chunkDir = path.resolve(UPLOAD_DIR, fileHash);

  // 检查分片目录是否存在
  if (!fs.existsSync(chunkDir)) {
    return res.status(400).json({ error: '分片目录不存在' });
  }

  // 检查分片数量
  const chunks = fs.readdirSync(chunkDir);
  if (chunks.length !== parseInt(totalChunks)) {
    return res.status(400).json({ error: '分片数量不匹配' });
  }

  // 按分片索引排序
  chunks.sort((a, b) => parseInt(a) - parseInt(b));

  try {
    // 创建最终文件
    const finalFileName = `${fileHash}-${fileName}`;
    const finalFilePath = path.resolve(FINAL_DIR, finalFileName);
    const writeStream = fs.createWriteStream(finalFilePath);

    // 合并分片
    for (const chunk of chunks) {
      const chunkPath = path.resolve(chunkDir, chunk);
      const chunkData = fs.readFileSync(chunkPath);
      writeStream.write(chunkData);

      // 删除分片文件
      fs.unlinkSync(chunkPath);
    }

    // 关闭文件流
    writeStream.end();

    // 删除分片目录
    fs.rmdirSync(chunkDir);

    res.json({
      success: true,
      filePath: finalFileName,
      fileSize: parseInt(fileSize)
    });
  } catch (error) {
    console.error('合并文件出错:', error);
    res.status(500).json({ error: '合并文件失败' });
  }
});

// 启动服务器
app.listen(port, () => {
  console.log(`文件上传服务已启动，访问 http://localhost:${port}`);
});