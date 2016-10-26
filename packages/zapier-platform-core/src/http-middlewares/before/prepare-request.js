'use strict';

const _ = require('lodash');
const stream = require('stream');
const querystring = require('querystring');

const cleaner = require('../../tools/cleaner');
const requestMerge = require('../../tools/request-merge');

const isStream = (obj) => obj instanceof stream.Stream;
const isPromise = (obj) => obj && typeof obj.then === 'function';

// Be careful not to JSONify a stream or buffer, stuff like that
const coerceBody = (req) => {
  const contentType = (req.headers || {})['content-type'] || '';

  if (contentType === 'application/x-www-form-urlencoded' && req.body && !_.isString(req.body)) {
    req.body = querystring.stringify(req.body);
  }

  if (isStream(req.body)) {
    // leave a stream/pipe alone!
  } else if (isPromise(req.body)) {
    // leave a promise alone!
  } else if (_.isBuffer(req.body)) {
    // leave a buffer alone!
  } else if (req.body && !_.isString(req.body)) {
    // this is a general - popular fallback
    req.body = JSON.stringify(req.body);
    req.headers['content-type'] = 'application/json; charset=utf-8';
  }

  return req;
};

// Wrap up the request in a promise - if needed.
const finalRequest = (req) => {
  if (isPromise(req.body)) {
    return req.body
      .then(reqBodyRes => {
        if (reqBodyRes && reqBodyRes.body && typeof reqBodyRes.body.pipe === 'function') {
          req.body = reqBodyRes.body;
        } else if (reqBodyRes && reqBodyRes.content && typeof reqBodyRes.content === 'string') {
          req.body = reqBodyRes.content;
        } else {
          req.body = reqBodyRes;
          // we could inspect response headers from reqBodyRes
          // and apply content type to req - but maybe later
          req = coerceBody(req);
        }
        return req;
      });
  } else {
    return req;
  }
};

const prepareRequest = function(req) {
  const input = req.input || {};

  req = _.defaults(req, {
    sync: false, // TODO: gotta sync if we wanna migrate old apps! :scream:
    merge: true,
    replace: true, // always replace curlies
    prune: false, // TODO: do we prune empty {{missing}} vars?,
    _addContext: () => {}
  });

  // apply app requestTemplate to request
  if (req.merge) {
    const requestTemplate = (input._zapier.app || {}).requestTemplate;
    req = requestMerge(requestTemplate, req);
  }

  // replace sensitive data in the request
  if (req.replace) {
    const bank = cleaner.createBundleBank(input._zapier.app, input._zapier.event);
    req = cleaner.recurseReplaceBank(req, bank);
  }

  // do a few final cleanup bits
  if (req.method === 'GET') {
    delete req.body;
  }

  req = coerceBody(req);

  if (req.sync) {
    // TODO
    throw new Error('sync coming later');
  }

  req._requestStart = new Date();

  req._addContext(`Starting ${req.method} request to ${req.url}`);

  return finalRequest(req);
};

module.exports = prepareRequest;
