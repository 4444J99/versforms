import {readPublic} from '../lib/public-reader.js';
export function onRequest({request,env}) {return readPublic(request,env);}
