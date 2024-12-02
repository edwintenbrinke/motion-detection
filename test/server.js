const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 4000;

// CORS middleware for allowing Vue front-end requests
const cors = require('cors');
app.use(cors());

// Route to stream video
app.get('/video/:filename', (req, res) => {
    const filePath = path.join(__dirname, '../python/recordings', req.params.filename);

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            return res.status(404).send('File not found');
        }

        const range = req.headers.range;
        if (!range) {
            return res.status(416).send('Requires Range header');
        }

        const videoSize = stats.size;
        const CHUNK_SIZE = 10 ** 6; // 1MB
        const start = Number(range.replace(/\D/g, ''));
        const end = Math.min(start + CHUNK_SIZE, videoSize - 1);

        const contentLength = end - start + 1;

        const headers = {
            'Content-Range': `bytes ${start}-${end}/${videoSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': contentLength,
            'Content-Type': 'video/mp4',
        };

        res.writeHead(206, headers);

        const stream = fs.createReadStream(filePath, { start, end });
        stream.pipe(res);
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

