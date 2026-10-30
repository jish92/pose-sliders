import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization, EXTTextureWebP } from '@gltf-transform/extensions';
import { quantize, meshopt, textureCompress, prune, dedup } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
const [,, inp, out] = process.argv;
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization, EXTTextureWebP])
  .registerDependencies({'meshopt.encoder': MeshoptEncoder,'meshopt.decoder': MeshoptDecoder});
const doc = await io.read(inp);
// corrective morph normals computed offline from the posed geometry (the exporter's own morph normals produce shading shards)
import fs from 'fs';
const nrmFile = process.argv[4];
if (nrmFile) {
  const names = JSON.parse(fs.readFileSync(nrmFile + '/nrm_names.json'));
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh || !names[node.getName()] || !fs.existsSync(`${nrmFile}/nrm_${node.getName()}.bin`)) continue;
    const buf = fs.readFileSync(`${nrmFile}/nrm_${node.getName()}.bin`); const all = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    const prim = mesh.listPrimitives()[0]; const n = prim.getAttribute('POSITION').getCount();
    prim.listTargets().forEach((t, ti) => {
      const a = doc.createAccessor().setType('VEC3').setArray(all.slice(ti * n * 3, (ti + 1) * n * 3)); t.setAttribute('NORMAL', a);
    });
    console.log('morph normals ->', node.getName());
  }
}
await doc.transform(dedup(), prune(),
  textureCompress({encoder: sharp, targetFormat:'webp', resize:[2048,2048], quality:88}),
  quantize({quantizePosition:14, quantizeNormal:12, quantizeTexcoord:14, quantizeWeight:16}),
  meshopt({encoder: MeshoptEncoder, level:'high'}));
await io.write(out, doc);
