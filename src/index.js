const JSZIP = require('jszip');
const glob = require('glob');
const displayDevServer = require('@mediamonks/display-dev-server');

const findRichmediaRC = require('@mediamonks/display-dev-server/src/util/findRichmediaRC');
const expandWithSpreadsheetData = require('@mediamonks/display-dev-server/src/util/expandWithSpreadsheetData');
const parsePlaceholdersInObject = require('@mediamonks/display-dev-server/src/util/parsePlaceholdersInObject');

const Uploader = require('s3-batch-upload').default;
const { v4: uuidv4 } = require('uuid');

const child_process = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require("util");



// const app = require('express')();
// const http = require('http').Server(app);
// const io = require('socket.io')(http);


const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);




const log_stdout = process.stdout;
const toHref = (url, label) => '<a target="_blank" href="'+url+'">' + (label || url) + '</a>';
const port = process.env.PORT || 3000;



console.log = async (d, socket) => { //
    log_stdout.write(util.format(d) + '\n');
    if (socket) {
        await socket.emit('update message', { data: d});
        await pause();
    }
};

const pause = async (amount = 50) => {
    return new Promise((resolve) => {
        setTimeout(()=> {
            resolve();
        }, amount)
    })
}

const getRepoNameFromUrl = (url) => {
    console.log(url);
    const firstIndex = url.lastIndexOf('/') + 1
    const lastIndex = url.indexOf('.git') - firstIndex;
    return url.substr(firstIndex, lastIndex);
}

app.use('/js', express.static(path.join(__dirname, './static/js')));
app.use('/css', express.static(path.join(__dirname, './static/css')));

app.get('/', (req, res) => {
    console.log('heya')
    res.sendFile(__dirname + '/static/index.html');
});

io.on('connection', async (socket) => {
    console.log('Client Connected')

    socket.on('grabTemplate', async msg => {
        await console.log(`getting template: ${msg.input_template}`, socket)

        try {
            await grabTemplate(msg, socket);

        } catch (e) {
            await console.log(`error: couldn't grab template`, socket)
        }
    });

    socket.on('generateAds', async msg => {
        await console.log(`starting build with template: ${msg.input_template}`, socket)

        try {
            const result = await generateAds(msg, socket);
            await console.log(`build status:${result}`, socket)
        } catch (e) {
            console.log(e);
            await console.log(`error: couldn't generate ads`, socket)
        }
    });
});


server.listen(port, () => {
    console.log(`Display Ads Generator - Server running at http://localhost:${port}/`);
});

const sourceDir = `.cache`;
let branchName, repoUrl, repoName, buildTarget, configOverride;


const grabTemplate = async (options, socket) => {
    branchName = options.input_branch;
    repoUrl = options.input_template;
    repoName = getRepoNameFromUrl(repoUrl);

    //in case of auth
    if (options.input_username !== '' && options.input_password !== '') {
        const splitRepoUrl = repoUrl.split('https://');
        repoUrl = `https://${options.input_username}:${options.input_password}@${splitRepoUrl[1]}`
    }

    console.log(options)

    buildTarget = `./${sourceDir}/${repoName}/build`;
    await console.log(`build folder set to ${buildTarget}...`, socket)

    if (!fs.existsSync(`./${sourceDir}`)) fs.mkdirSync(`./${sourceDir}`);

    if (!fs.existsSync(`./${sourceDir}/${repoName}`)) {
        await console.log(`directory doesnt exist. cloning into ./${sourceDir}/${repoName}...`, socket)
        child_process.execSync(`cd ${sourceDir} && git clone ${repoUrl}`);
    } else {
        await console.log(`directory ./${sourceDir}/${repoName} exists already. pulling latest...`, socket)
        child_process.execSync(`cd ${sourceDir}/${repoName} && git pull`);
    }

    if (branchName !== '') {
        await console.log(`fetching branch ${branchName}...`, socket)
        child_process.execSync(`cd ${sourceDir}/${repoName} && git checkout ${branchName}`);
    }


    let configs = await findRichmediaRC(`./${sourceDir}/${repoName}/**/.richmediarc*`, ['settings.entry.js', 'settings.entry.html']);
    //console.log(configs)


    configs.forEach(config => {

        if(config.data.settings.contentSource) {
            config.data.settings.contentSource = parsePlaceholdersInObject(config.data.settings.contentSource, config.data);
        }

        console.log(config.data.settings.contentSource)
        if (options.input_feed !== '') {

            console.log('Found a contentSource override!!')
            config.data.settings.contentSource = {
                url: options.input_feed
            }
        }
    })


    configs = await expandWithSpreadsheetData(configs, 'production');


    let socketIoConfig = [];

    configs.forEach(config => {
        console.log(path.basename(config.location))
        socketIoConfig.push({
            location: config.location,
            baseName: path.basename(config.location)
        })
    })

    console.log(socketIoConfig);
    await socket.emit('list ads', { data: socketIoConfig});
}



const generateAds = async (options, socket) => {
    console.log(options.selectedAds);

    configOverride = {
        settings: {
            optimizations: options.optimizations,
            useOriginalFileNames: options.preserve_filenames,
        }
    }

    if (options.input_feed !== '') configOverride.settings.contentSource = {
        url: options.input_feed
    }
    const adLocations = options.selectedAds.map(ad => ad.location)



    console.log(configOverride)

    await console.log('compiling...', socket)

    const socketMsg = options.selectedAds.map(ad => {
        return {
            name: ad.name,
            outputName: 'In Progress',
            html: 'In Progress',
            preview: 'In Progress',
            zip: 'In Progress',
            video: 'In Progress',
            gif: 'In Progress',
            jpg: 'In Progress'
            // configPath: result.settings.location,
            // builtFilesPath: result.webpack.output.path,
            // builtHtmlPath: result.webpack.output.path + '/index.html',
            // html: 'Done',
            // builtZipPath: result.webpack.output.path + '.zip',
            // zip: 'Done'
        }
    })

    socket.emit('ads built', { data: socketMsg});


    let buildResult;
    try {
        buildResult = await displayDevServer({
            mode: 'production',
            glob: `./${sourceDir}/${repoName}/**/.richmediarc*`,
            choices: {
                location: adLocations,
                emptyBuildDir: true
            },
            buildTarget,
            configOverride
        });

    } catch (e) {
        console.log(e);
        console.log('error: failed build', socket)
        return;
    }

    // console.log(buildResult)

    // console.log(buildResult[0]);
    // console.log(buildResult.length)

    //
    buildResult.forEach(result => {
        //console.log("name: " + path.basename(result.settings.location));
        //console.log("location of config: " + result.settings.location);
        //console.log("abs path to built files: " + result.webpack.output.path);
        //console.log("abs path to built html: " + result.webpack.output.path + '/index.html');
        //console.log("abs path to zip: " + result.webpack.output.path + '.zip');
        //console.log(fs.existsSync(path.resolve(result.webpack.output.path + '.zip')))

        const socketMsgEl = socketMsg.find(element => element.name === path.basename(result.settings.location));
        //console.log(socketMsgEl);

        socketMsgEl.outputName = path.basename(result.webpack.output.path);
        socketMsgEl.html = 'Done';
    })


    console.log(socketMsg)

    socket.emit('ads built', { data: socketMsg});




    // console.log('creating zip files...', socket);
    //
    // try {
    //     const zip = new JSZIP();
    //     const zipFilesArray = glob.sync(`${buildTarget}/*.zip`, {});
    //
    //     zipFilesArray.forEach(zipFile => {
    //         const zipFileData = fs.readFileSync(zipFile);
    //         const zipFileName = path.basename(zipFile);
    //         zip.file(zipFileName, zipFileData);
    //     })
    //
    //     const zipData = await zip.generateAsync({type:"nodebuffer"})
    //     await fs.writeFileSync(`${buildTarget}/${repoName}.zip`, zipData);
    //
    // } catch (e) {
    //     console.log('error: failed creating zips', socket)
    // }




    console.log('uploading files to preview server...', socket);
    try {

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

        socketMsg.forEach(ad => {
            ad.preview = toHref(previewUrl + "/" + ad.outputName + "/index.html", "Done");
            ad.zip = toHref(previewUrl + "/" + ad.outputName + ".zip", "Done");
        })

    } catch (e) {
        console.log('error: failed upload', socket)
    }

    socket.emit('ads built', { data: socketMsg});

    return "finalized"
}

