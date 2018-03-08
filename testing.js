const path = require('path');
const fs = require('fs-extra');
const tmp = require('tmp');
const createServer = require('./index');

export async function startServer(port) {
  const tempDir = tmp.dirSync().name;
  const server = createServer(
    {
      port: port,
      absolutePath: tempDir,
    },
    true
  );
  return {
    url: `http://localhost:${port}`,
    path: tempDir,
    stop: function() {
      server.close();
    },
    clearAnnotation: id => {
      return clearAnnotation(tempDir, `http://localhost:${port}`, id);
    },
    readAnnotation: id => {
      return readAnnotation(tempDir, id);
    },
  };
}

export function getRootPath() {
  return path.join(__dirname, '.elucidate');
}

export async function clearAnnotation(pathToElucidate, server, id) {
  try {
    await fs.writeJson(path.join(pathToElucidate, `${id}.json`), {
      '@context': [
        'http://www.w3.org/ns/anno.jsonld',
        'http://www.w3.org/ns/ldp.jsonld',
      ],
      id: `${server}/w3c/annotation/${id}/`,
      type: 'AnnotationCollection',
      label: 'http://dams.llgc.org.uk/iiif/2.0/4693064/canvas/4693071.json',
      first: {
        type: 'AnnotationPage',
        items: [],
        partOf: `${server}/w3c/annotation/${id}/`,
        startIndex: 0,
      },
      last: `${server}/w3c/annotation/${id}/?page0&desc=1`,
      total: 0,
    });
    return true;
  } catch (err) {
    return false;
  }
}

export async function readAnnotation(pathToElucidate, id) {
  try {
    return await fs.readJson(path.join(pathToElucidate, `${id}.json`));
  } catch (err) {
    return false;
  }
}
