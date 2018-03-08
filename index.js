const Koa = require('koa');
const Router = require('koa-router');
const json = require('koa-json');
const bodyParser = require('koa-bodyparser');
const fs = require('fs-extra');
const path = require('path');
const uuidv4 = require('uuid/v4');
const cors = require('koa-cors');
const mkdirp = require('mkdirp-promise');

module.exports = function createServer(argv, start, logging = false) {
  const app = new Koa();
  const router = new Router();

  const folderPath =
    argv.absolutePath || path.join(process.cwd(), argv.path || '.elucidate');
  const dirIsReady = mkdirp(folderPath);

  const log = function(...args) {
    if (logging) {
      console.log(...args);
    }
  };

  function makeId(ctx, container, annotation) {
    if (annotation) {
      return `${ctx.request.protocol}://${
        ctx.request.host
      }/w3c/annotation/${container}/${annotation}`;
    }
    return `${ctx.request.protocol}://${
      ctx.request.host
    }/w3c/annotation/${container}/`;
  }

  function getIdFromIri(iri) {
    const parts = iri.split('/').filter(e => e);
    return parts[parts.length - 1];
  }

  const getContainer = async (ctx, container) => {
    try {
      await dirIsReady;

      const file = await fs.readJson(
        path.join(folderPath, `${container}.json`)
      );

      file.id = makeId(ctx, container);
      file.first.items = (file.first.items || []).map(item => {
        const idFrag = getIdFromIri(item.id);
        item.id = makeId(ctx, container, idFrag);
        return item;
      });

      return file;
    } catch (err) {
      return null;
    }
  };

  const getAnnotationFromContainer = async (ctx, containerId, annotationId) => {
    const container = await getContainer(ctx, containerId);
    if (!container) {
      return null;
    }

    const annotationJson = container.first.items.find(annotation => {
      return getIdFromIri(annotation.id) === annotationId;
    });

    if (!annotationJson) {
      return null;
    }

    return {
      '@context': 'http://www.w3.org/ns/anno.jsonld',
      ...annotationJson,
    };
  };

  const containerSkeleton = (ctx, containerId, { type, label }) => {
    const id = makeId(ctx, containerId || uuidv4());
    return {
      '@context': [
        'http://www.w3.org/ns/anno.jsonld',
        'http://www.w3.org/ns/ldp.jsonld',
      ],
      id: id,
      type: type || 'AnnotationCollection',
      label: label || 'Unnamed container',
      first: {
        type: 'AnnotationPage',
        items: [],
        partOf: id,
        startIndex: 0,
      },
      last: `${id}?page0&desc=1`,
      total: 0,
    };
  };

  function annotationSkeleton(ctx, containerId, annotation) {
    const id = makeId(ctx, containerId, uuidv4());

    annotation['@context'] = 'http://www.w3.org/ns/anno.jsonld';

    return Object.assign(
      {
        '@context': 'http://www.w3.org/ns/anno.jsonld',
        id,
        type: 'Annotation',
      },
      annotation
    );
  }

  const containerExists = async containerId => {
    await dirIsReady;
    const id = getIdFromIri(containerId);

    return await fs.exists(path.join(folderPath, `${id}.json`));
  };

  const saveContainer = async (ctx, container) => {
    await dirIsReady;
    const id = getIdFromIri(container.id);
    const containerPath = path.join(folderPath, `${id}.json`);

    await fs.writeJson(containerPath, container, {
      spaces: 2,
    });

    log('Saved container', containerPath);

    return container;
  };

  //////////////////////////////////////////////////////////////
  /// GET CONTAINER
  //////////////////////////////////////////////////////////////
  router.get('/w3c/annotation/:container', async ctx => {
    const { container } = ctx.params;

    const containerJson = await getContainer(ctx, container);

    if (!containerJson) {
      ctx.status = 404;
      return;
    }

    ctx.body = containerJson;
  });

  //////////////////////////////////////////////////////////////
  /// GET ANNOTATION
  //////////////////////////////////////////////////////////////
  router.get('/w3c/annotation/:container/:annotation', async ctx => {
    const { container, annotation } = ctx.params;

    const annotationJson = await getAnnotationFromContainer(
      ctx,
      container,
      annotation
    );

    if (!annotationJson) {
      ctx.throw(404);
    }

    ctx.body = annotationJson;
  });

  router.post('/w3c/annotation', async ctx => {
    // create container ctx.headers.Slug for ID
    const body = ctx.request.body || {};
    const { slug } = ctx.request.headers;

    const container = containerSkeleton(ctx, slug, body);

    if (await containerExists(container.id)) {
      log(`Container already exists: ${container.id}`);
      ctx.throw(409);
    }

    log(`Saving new annotation into Container: ${container.id}`);
    ctx.body = await saveContainer(ctx, container);
  });

  router.post('/w3c/annotation/:container', async ctx => {
    const { container } = ctx.params;
    const body = ctx.request.body || {};

    const containerJson = await getContainer(ctx, container);

    if (!containerJson) {
      log(`Container does not exist exists: ${container}`);
      ctx.status = 404;
      return;
    }

    const annotationJson = annotationSkeleton(ctx, container, body);

    ctx.body = annotationJson;

    containerJson.first.items.push(annotationJson);
    containerJson.total = containerJson.first.items.length;

    log(
      `Saving new annotation into Container: ${containerJson.id} Annotation: ${
        annotationJson.id
      }`
    );
    await saveContainer(ctx, containerJson);

    ctx.response.status = 201;
  });

  router.put('/w3c/annotation/:container/:annotation', ctx => {
    const { container, annotation } = ctx.params;
    ctx.body = `Container: ${container} Annotation: ${annotation}`;
    // @todo.
  });
  app.use(
    cors({
      credentials: true,
      expose: [
        'ETag',
        'Link',
        'Allow',
        'Vary',
        'Content-Length',
        'Content-Location',
        'Accept-Post',
        'Location',
      ],
    })
  );
  app.use(
    bodyParser({
      extendTypes: {
        json: ['application/ld+json'],
      },
    })
  );
  app.use(router.routes()).use(router.allowedMethods());
  app.use(json());

  if (start) {
    log(
      `Starting Elucidate Micro server at http://localhost:${argv.port || 4242}`
    );
    return app.listen(argv.port || 4242);
  }
  return app;
};
