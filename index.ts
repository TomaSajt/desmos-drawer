import ffmpeg from 'ffmpeg';
import fs from 'fs';
import Image from 'image-js';
const cannyEdgeDetector = require('canny-edge-detector');
const potrace = require('potrace');


build("nggyu.mp4", 69);


class StringConsumer {
    private matches?: RegExpMatchArray;
    private nextPos = 0;
    done: boolean;
    constructor(str: string) {
        var regex = /\S+/g;
        this.matches = str.match(regex) ?? undefined;
        this.done = this.matches ? false : true;

    }
    peek(): string {
        if (!this.done && this.matches) {
            return this.matches[this.nextPos];
        }
        throw new Error('already done');
    }

    consume(): string {
        if (!this.done && this.matches) {
            var t = this.matches[this.nextPos++];
            if (this.nextPos >= this.matches.length) {
                this.done = true;
            }
            return t;
        }
        throw new Error('already done');
    }
}

async function build(filename: string, frames: number) {
    //Create directories
    fs.rmdirSync('./build', { recursive: true })
    fs.mkdirSync('./build')
    fs.mkdirSync('./build/raw')
    fs.mkdirSync('./build/edge')
    fs.mkdirSync('./build/svg')
    fs.mkdirSync('./build/desmos')

    //Read video
    var video = await new ffmpeg(filename);

    //Separate video into frames
    await video.fnExtractFrameToJPG('./build/raw', { file_name: 'raw', number: frames })

    for (let i = 1; i <= frames; i++) {
        console.log(`${i} start`);
        //Load frame
        var img = await Image.load(`./build/raw/raw_${i}.jpg`)

        //Detect edges
        const grey = img.grey();
        const edge: Image = cannyEdgeDetector(grey);
        await edge.save(`./build/edge/edge_${i}.png`);

        //Convert from png to svg
        potrace.trace(`./build/edge/edge_${i}.png`, (err: any, svg: string) => {
            if (err) throw err;
            fs.writeFileSync(`./build/svg/${i}.svg`, svg);

            //Convert from svg to expressions
            var expressions = svgToDesmos(svg);
            fs.writeFileSync(`./build/desmos/desmos${i}.txt`, expressions);

        });
        console.log(`${i} end`);
    }
    console.log("done");


    function svgToDesmos(svg: string): string {
        var expressions = '';
        var svgDPath = svg.substring(svg.indexOf(' d="') + 4, svg.indexOf('" stroke'))
        var strcsr = new StringConsumer(svgDPath);
        var mode: string = 'M';
        var startPosX: string = '0';
        var startPosY: string = '0';
        while (!strcsr.done) {
            switch (strcsr.peek()) {
                case 'M':
                case 'L':
                case 'C':
                    mode = strcsr.consume();
                    break;
                default:
                    break;
            }
            switch (mode) {
                case 'M':
                    {
                        startPosX = strcsr.consume();
                        startPosY = strcsr.consume();
                        break;
                    }
                case 'L':
                    {
                        var endPosX = strcsr.consume()
                        var endPosY = strcsr.consume()
                        expressions += String.raw`t\cdot\left(${startPosX},\ -${startPosY}\right)+\left(1-t\right)\left(${endPosX},\ -${endPosY}\right)`;
                        expressions += '\n';
                        startPosX = endPosX;
                        startPosY = endPosY;
                        break;
                    }
                case 'C':
                    {
                        var p1X = strcsr.consume()
                        var p1Y = strcsr.consume().replace(',', '');
                        var p2X = strcsr.consume()
                        var p2Y = strcsr.consume().replace(',', '');
                        var endPosX = strcsr.consume()
                        var endPosY = strcsr.consume()
                        expressions += String.raw`t^{3}\left(${startPosX},\ -${startPosY}\right)+3t^{2}\left(1-t\right)\left(${p1X},\ -${p1Y}\right)+3t\left(1-t\right)^{2}\left(${p2X},\ -${p2Y}\right)+\left(1-t\right)^{3}\left(${endPosX},\ -${endPosY}\right)`;
                        expressions += '\n';
                        startPosX = endPosX;
                        startPosY = endPosY;
                        break;
                    }
            }
        }
        return expressions
    }

}