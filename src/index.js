const JSZIP = require('jszip');
const glob = require('glob');
const displayDevServer = require('@mediamonks/display-dev-server');

const Uploader = require('s3-batch-upload').default;
const { v4: uuidv4 } = require('uuid');

const child_process = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require("util");

const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);

const log_stdout = process.stdout;
const toHref = (url, label) => '<a target="_blank" href="'+url+'">' + (label || url) + '</a>';
const port = process.env.PORT || 3000;

console.log = function(d, socket) { //
    log_stdout.write(util.format(d) + '\n');
    if (socket) socket.emit('update message', { data: d});
};

const getRepoNameFromUrl = (url) => {
    console.log(url);
    const firstIndex = url.lastIndexOf('/') + 1
    const lastIndex = url.indexOf('.git') - firstIndex;
    return url.substr(firstIndex, lastIndex);
}

const buildAllTheFiles = async (socket, options) => {
    const sourceDir = `.cache`;
    const branchName = options.input_branch;
    let repoUrl = options.input_template;


    if (options.input_username !== '' && options.input_password !== '') {
        const splitRepoUrl = repoUrl.split('https://');
        repoUrl = `https://${options.input_username}:${options.input_password}@${splitRepoUrl[1]}`
    }

    const repoName = getRepoNameFromUrl(repoUrl);

    console.log(options)

    const buildTarget = `./${sourceDir}/${repoName}/build`;
    console.log(`build folder set to ${buildTarget}...`, socket)

    if (!fs.existsSync(`./${sourceDir}`)) fs.mkdirSync(`./${sourceDir}`);

    if (!fs.existsSync(`./${sourceDir}/${repoName}`)) {
        console.log(`directory doesnt exist. cloning into ./${sourceDir}/${repoName}...`, socket)
        child_process.execSync(`cd ${sourceDir} && git clone ${repoUrl}`);

        if (branchName !== '') {
            console.log(`fetching branch ${branchName}...`, socket)
            child_process.execSync(`cd ${sourceDir}/${repoName} && git checkout ${branchName}`);
        }

    } else {
        console.log(`directory ./${sourceDir}/${repoName} exists already. pulling latest...`, socket)
        child_process.execSync(`cd ${sourceDir}/${repoName} && git pull`);
    }

    console.log('installing dependencies...', socket)
    child_process.execSync(`cd ${sourceDir}/${repoName} && npm install`);

    console.log('configOverride time', socket)

    const configOverride = {
        settings: {
            optimizations: options.optimizations,
            useOriginalFileNames: options.preserve_filenames,
        }
    }

    if (options.input_feed !== '') configOverride.settings.contentSource = {
        url: options.input_feed
    }

    console.log('compiling...', socket)
    await displayDevServer({
        mode: 'production',
        glob: `./${sourceDir}/${repoName}/**/.richmediarc*`,
        choices: {
            location: 'all',
            emptyBuildDir: true
        },
        buildTarget,
        configOverride
    });

    console.log('creating zip files...', socket);
    const zip = new JSZIP();
    const zipFilesArray = glob.sync(`${buildTarget}/*.zip`, {});

    zipFilesArray.forEach(zipFile => {
        const zipFileData = fs.readFileSync(zipFile);
        const zipFileName = path.basename(zipFile);
        zip.file(zipFileName, zipFileData);
    })

    const zipData = await zip.generateAsync({type:"nodebuffer"})
    await fs.writeFileSync(`${buildTarget}/${repoName}.zip`, zipData);

    console.log('uploading files to preview server...', socket);

    const remotePath = uuidv4();
    await new Uploader({
        config: {
            "accessKeyId": process.env.preview_accessKeyId,
            "secretAccessKey": process.env.preview_accessKeySecret
        },
        bucket: process.env.Preview_s3bucket,
        localPath: buildTarget,
        remotePath,
        glob: '*.*', // default is '*.*'
        concurrency: '200', // default is 100
        dryRun: false, // default is false
        // cacheControl: 'max-age=300', // can be a string, for all uploade resources
        cacheControl: {
            // or an object with globs as keys to match the input path
            // '**/settings.json': 'max-age=60', // 1 mins for settings, specific matches should go first
            // '**/*.json': 'max-age=300', // 5 mins for other jsons
            '**/*.*': 'max-age=60', // 1 hour for everthing else
        },
    }).upload();

    const previewUrl = `http://${process.env.Preview_s3bucket}.s3.amazonaws.com/${remotePath}`;

    console.log(`preview url here:<br>${toHref(`${previewUrl}/index.html`)}`, socket)
    console.log(`download deliverables here:<br>${toHref(previewUrl+'/'+repoName+'.zip')}`, socket)
}

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/static/index.html');
});

io.on('connection', async (socket) => {
    console.log('Client Connected')

    socket.on('generateAds', async msg => {
        console.log(`starting build with template: ${msg.input_template}`, socket)

        try {
            await buildAllTheFiles(socket, msg);

        } catch (e) {  }
    });
});


(async () => {
    http.listen(port, () => {
        console.log(`Deck Optimmizer - Server running at http://localhost:${port}/`);
    });
})();


