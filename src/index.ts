import  fetch from 'node-fetch';
import moment from 'moment';
import PromiseFtp from 'promise-ftp';
import 'dotenv/config';
import { exec } from 'child-process-promise';
import * as fs from 'fs';
const baseTmpPath = `${__dirname}/..`;
const tmpSnapPath = `${baseTmpPath}/tmp.jpg`;
const tmpClipPath = `${baseTmpPath}/tmp.mp4`;
const tmpOutPath = `${baseTmpPath}/tmp.out.mp4`;



const startUnix = moment().set({
  hour: 10,
  minute: 0,
  second:0
}).unix();
const endUnix = moment().set({
  hour: 0,
  minute: 0,
  second:0
}).add('1','day').subtract('1', 'second').unix();

async function yo() {
  console.log('fetching');
  const f = await fetch(`http://frigate2.iot:5000/api/events?after=${startUnix}&before=${endUnix}&has_clip=1&include_thumbnails=0`);
  const res = await f.json();
  const ftp = new PromiseFtp();
  console.log('connecting ftp');
  await ftp.connect({
    host: process.env.FTP_HOST,
    port: parseInt(process.env.FTP_PORT!),
    user: process.env.FTP_USER,
    password: process.env.FTP_PASS
  });
  console.log('connected');
  await ftp.cwd('NVR');

  for (const item of res) {
    if (item.end_time === null || !item.has_clip) continue;
    const r = await fetch(`${process.env.FRIGATE_BASEURL}/api/events/${item.id}/clip.mp4`);
    const date =  moment.unix(item.start_time);
    const path = `${date.format('YYYY/MM/DD')}/${item.camera}/`;
    await ftp.mkdir(path, true);
    const data = await r.buffer();
    if (data.length < 100) {
      console.log('no clip for', item);
    } else {
      const snap = await fetch(`${process.env.FRIGATE_BASEURL}/api/events/${item.id}/snapshot.jpg?quality=100`);
      const snapBuf = await snap.buffer();
      fs.writeFileSync(tmpSnapPath, snapBuf);
      fs.writeFileSync(tmpClipPath, data);
      const cmd = `ffmpeg -y -i ${tmpClipPath} -i ${tmpSnapPath}  -map 0 -map 1 -c copy -c:v:1 png -disposition:v:1 attached_pic ${tmpOutPath}`;
      console.log('converting');
      await exec(cmd, {cwd: baseTmpPath})
      await ftp.put(fs.createReadStream(tmpOutPath), `${path}/${date.format('HH_mm')}.mp4`);
      console.log('done');

      fs.unlinkSync(tmpSnapPath);
      fs.unlinkSync(tmpClipPath);
      fs.unlinkSync(tmpOutPath);
    }
  }
  await ftp.end();
}

yo().catch(console.log);