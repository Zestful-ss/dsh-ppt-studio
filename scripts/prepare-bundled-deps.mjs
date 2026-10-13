// Maintainer-only: materialize the local Review Dock dependency before committing.
// Git-hosted pnpm installs omit symlinked bundled dependencies.
import {cp,rm} from 'node:fs/promises';
const target=new URL('../node_modules/dsh-review-dock',import.meta.url);
await rm(target,{recursive:true,force:true});
await cp(new URL('../vendor/review-dock',import.meta.url),target,{recursive:true});
console.log('Review Dock bundled as regular files');
