// const { spawn } = require('child_process');
const ffmpeg = require('fluent-ffmpeg');
const { Command } = require('discord.js-commando');
const { MessageEmbed } = require('discord.js');
const puppeteer = require('puppeteer');
const ytdl = require('ytdl-core-discord');
const Youtube = require('simple-youtube-api');
const youtube = new Youtube(process.env.YOUTUBE_API_KEY);

module.exports = class Play extends Command {
    constructor(client) {
        super(client, {
            name: 'play',
            memberName: 'play',
            group: 'music',
            description: 'plays audio from youtube or facebook',
            guildOnly: true,
            clientPermissions: ['SPEAK', 'CONNECT'],
            args: [
                {
                    key: 'query',
                    prompt: 'what do you want to listen to?',
                    type: 'string',
                    validate: query => query.length > 0
                }
            ],
            throttling: {
                usages: 1,
                duration: 5
            }
        });
    }

    run = async(message, { query }) => {
        try {
            const voiceChannel = message.member.voice.channel;

            if (!voiceChannel) {
                const embed = new MessageEmbed().setColor('#ff0000').setTitle(':x: You need to join a voice channel first');
                return await message.say({ embed });
            }

            const embed = new MessageEmbed().setColor('#000099').setTitle(':arrows_counterclockwise: Loading');
            await message.say({ embed });

            if (query.match(/^(?!.*\?.*\bv=)https:\/\/www\.youtube\.com\/.*\?.*\blist=.*$/)) {
                const link = query.match(/^(?!.*\?.*\bv=)https:\/\/www\.youtube\.com\/.*\?.*\blist=.*$/)[0];
                const playlist = await youtube.getPlaylist(link);
                const playlistVideos = await playlist.getVideos();

                playlistVideos.forEach(async playlistVideo => {
                    const video = await youtube.getVideoByID(playlistVideo.id);

                    const title = video.title;
                    const by = video.channel.title;
                    const durationString = message.guild.formatDuration(video.duration);
                    const thumbnail = video.thumbnails.high.url;
                    const data = {
                        type: 'youtube',
                        link: `https://www.youtube.com/watch?v=${video.id}`,
                        title,
                        by,
                        duration: durationString !== '00:00:00' ? { hours: video.duration.hours, minutes: video.duration.minutes, seconds: video.duration.seconds, string: durationString } : 'Live Stream',
                        thumbnail,
                        voiceChannel
                    };

                    message.guild.music.queue.push(data);

                    if (message.guild.music.isPlaying === false || message.guild.music.isPlaying === undefined) {
                        message.guild.music.isPlaying = true;
                        return this.play(message.guild.music.queue, message);
                    }
                });
                if (message.guild.music.isPlaying) {
                    const embed = new MessageEmbed().setColor('#000099').setTitle(`:arrow_forward: ${playlist.title} (${playlistVideos.length} tracks) added to queue`);
                    return await message.say({ embed });
                }
            } else if (query.match(/^(http(s)?:\/\/)?((w){3}.)?youtu(be|.be)?(\.com)?\/\S+/)) {
                const link = query.match(/^(http(s)?:\/\/)?((w){3}.)?youtu(be|.be)?(\.com)?\/\S+/)[0];
                const id = link.replace(/(>|<)/gi, '').split(/(vi\/|v=|\/v\/|youtu\.be\/|\/embed\/)/)[2].split(/[^0-9a-z_\-]/i)[0];

                const video = await youtube.getVideoByID(id);
                const title = video.title;
                const by = video.channel.title;
                const durationString = message.guild.formatDuration(video.duration);
                const thumbnail = video.thumbnails.high.url;

                const data = {
                    type: 'youtube',
                    link,
                    title,
                    by,
                    duration: durationString !== '00:00:00' ? { hours: video.duration.hours, minutes: video.duration.minutes, seconds: video.duration.seconds, string: durationString } : 'Live Stream',
                    thumbnail,
                    voiceChannel
                };

                message.guild.music.queue.push(data);

                if (message.guild.music.isPlaying === false || message.guild.music.isPlaying === undefined) {
                    message.guild.music.isPlaying = true;
                    return this.play(message.guild.music.queue, message);
                } else {
                    const embed = new MessageEmbed().setColor('#000099').setTitle(`:arrow_forward: ${data.title} added to queue`);
                    return await message.say({ embed });
                }
            } else if (query.match(/^(http(s)?:\/\/)?((w){3}.)?facebook?(\.com)?\/\S+\/videos\/\S+/)) {
                const link = query.match(/^(http(s)?:\/\/)?((w){3}.)?facebook?(\.com)?\/\S+\/videos\/\S+/)[0];

                const browser = await puppeteer.launch({
                    timeout: 0
                });
                const page = await browser.newPage();

                page.setDefaultNavigationTimeout(0);
                page.setDefaultTimeout(0);
                await page.goto(link, { waitUntil: 'networkidle2' });

                const titleHandle = await page.$('title');
                const metaHandle = await page.$('meta[property="og:video:url"]');
                
                let durationCode = (await page.content()).match(/mediaPresentationDuration=\\"\S+\\"/) || (await page.content()).match(/"duration":"\S+"/) || false;
                let durationArr = [0, 0, 0];

                if (durationCode && durationCode.toString().match(/mediaPresentationDuration=\\"\S+\\"/)) {
                    durationArr = durationCode.toString().replace(/mediaPresentationDuration=\\"/, '').replace(/\\"/, '').trim().split(/\D/).slice(2, 5).map(time => parseInt(time));
                } else if (durationCode && durationCode.toString().match(/"duration":"\S+"/)) {
                    durationCode.toString().match(/"duration":"T(\d+H)?(\d+M)?(\d+S")?/)[0].replace(/"duration":"/, '').replace(/"/, '').trim().match(/(\d+H)|(\d+M)|(\d+S)/g).forEach(time => {
                        if (time.toString().match(/\d+H/)) durationArr[0] = parseInt(time.match(/\d+/));
                        if (time.toString().match(/\d+M/)) durationArr[1] = parseInt(time.match(/\d+/));
                        if (time.toString().match(/\d+S/)) durationArr[2] = parseInt(time.match(/\d+/));
                    });
                }
                
                const durationString = durationArr ? message.guild.formatDuration({ hours: durationArr[0], minutes: durationArr[1], seconds: durationArr[2] + 1 }) : 'Live Stream';
                const title = await page.evaluate(title => title.innerText.replace(/\s\|\sfacebook/i, ''), titleHandle);
                const videoLink = await page.evaluate(meta => meta.getAttribute('content'), metaHandle);
                const data = {
                    type: 'facebook',
                    link: videoLink,
                    title: title.split(' - ')[1],
                    by: title.split(' - ')[0],
                    duration: durationString !== 'Live Stream' ? { hours: durationArr[0], minutes: durationArr[1], seconds: durationArr[2] + 1, string: durationString } : durationString,
                    voiceChannel
                };

                message.guild.music.queue.push(data);

                if (message.guild.music.isPlaying === false || message.guild.music.isPlaying === undefined) {
                    message.guild.music.isPlaying = true;
                    return this.play(message.guild.music.queue, message);
                } else {
                    const embed = new MessageEmbed().setColor('#000099').setTitle(`:arrow_forward: ${data.title} added to queue`);
                    return await message.say({ embed });
                }
            } else if (query.match(/^(http(s)?:\/\/)?((w){3}\S)?\S+(\.)\S+\/\S+\.(\S){3}/)) {
                const link = query.match(/^(http(s)?:\/\/)?((w){3}\S)?\S+(\.)\S+\/\S+\.(\S){3}/)[0];
                const title = link.split('/')[link.split('/').length - 1].split('.')[0];

                ffmpeg.ffprobe(link, async(err, metaData) => {
                    if (err) throw err;
                    else {
                        const duration = {
                            hours: new Date(Math.ceil(metaData.format.duration) * 1000).getUTCHours(),
                            minutes: new Date(Math.ceil(metaData.format.duration) * 1000).getUTCMinutes(),
                            seconds: new Date(Math.ceil(metaData.format.duration) * 1000).getSeconds(),
                            string: message.guild.formatDuration({
                                hours: new Date(Math.ceil(metaData.format.duration) * 1000).getUTCHours(),
                                minutes: new Date(Math.ceil(metaData.format.duration) * 1000).getUTCMinutes(),
                                seconds: new Date(Math.ceil(metaData.format.duration) * 1000).getSeconds()
                            })
                        };
                        const data = {
                            type: 'other',
                            link,
                            title,
                            duration,
                            voiceChannel
                        };

                        if (data) {
                            message.guild.music.queue.push(data);

                            if (message.guild.music.isPlaying === false || message.guild.music.isPlaying === undefined) {
                                message.guild.music.isPlaying = true;
                                return this.play(message.guild.music.queue, message);
                            } else {
                                const embed = new MessageEmbed().setColor('#000099').setTitle(`:arrow_forward: ${data.title} added to queue`);
                                return await message.say({ embed });
                            }
                        }
                    }
                });
            } else {
                const videos = await youtube.searchVideos(query, 1);
                if (videos.length !== 1) {
                    const embed = new MessageEmbed().setColor('#ff0000').setTitle(':x: Nothing found');
                    return await message.say({ embed });
                }

                const video = await youtube.getVideoByID(videos[0].raw.id.videoId);
                const title = video.title;
                const by = video.channel.title;
                const durationString = message.guild.formatDuration(video.duration);
                const thumbnail = video.thumbnails.high.url;
                const data = {
                    type: 'search',
                    link: `https://www.youtube.com/watch?v=${video.id}`,
                    title,
                    by,
                    duration: durationString !== '00:00:00' ? { hours: video.duration.hours, minutes: video.duration.minutes, seconds: video.duration.seconds, string: durationString } : 'Live Stream',
                    thumbnail,
                    voiceChannel
                };

                message.guild.music.queue.push(data);

                if (message.guild.music.isPlaying === false || message.guild.music.isPlaying === undefined) {
                    message.guild.music.isPlaying = true;
                    return this.play(message.guild.music.queue, message);
                } else {
                    const embed = new MessageEmbed().setColor('#000099').setTitle(`:arrow_forward: ${data.title} added to queue`);
                    return await message.say({ embed });
                }
            }
        } catch(err) {
            console.error(err);
            const embed = new MessageEmbed().setColor('#ff0000').setTitle(':x: Track is private or I just can\'t play this for some other reason');
            return message.say({ embed });
        }
    }

    play = async(queue, message) => {
        try {
            if (queue.length === 0) {
                const embed = new MessageEmbed().setColor('#ff0000').setTitle(':x: Error occured, if you are my creator please fix me soon');
                return await message.say({ embed });
            }

            const voiceChannel = queue[0].voiceChannel;
            const connection = await voiceChannel.join();
            let dispatcher;

            switch (queue[0].type) {
                case 'youtube': { dispatcher = connection.play(await ytdl(queue[0].link, { quality: 'highestaudio' }), { type: 'opus' }); break; }
                case 'facebook': { dispatcher = connection.play(queue[0].link); break; }
                case 'search': { dispatcher = connection.play(await ytdl(queue[0].link), { type: 'opus' }); break; }
                case 'other': { dispatcher = connection.play(queue[0].link); break; }
            }

            dispatcher.on('start', async() => {
                message.guild.music.nowPlaying = queue[0];
                message.guild.startCounter(message);
                message.guild.music.dispatcher = dispatcher;
                dispatcher.setVolume(message.guild.music.volume);
                const embed = new MessageEmbed().setColor('#000099').setTitle(`:arrow_forward: Play`).addField('Now playing', queue[0].title);
                if (queue[0].type === 'youtube' || queue[0].type === 'search') embed.setThumbnail(queue[0].thumbnail);
                if (queue[0].type === 'youtube' || queue[0].type === 'search' || queue[0].type === 'facebook') embed.addField('By', queue[0].by);
                embed.addField('Duration', queue[0].duration.string);
                await message.say({ embed });
                return queue.shift();
            });

            dispatcher.on('finish', async() => {
                if (queue.length >= 1) return this.play(queue, message);
                else {
                    message.guild.music.isPlaying = false;
                    message.guild.music.nowPlaying = null;
                    message.guild.music.dispatcher = null;
                    voiceChannel.leave();
                    const embed = new MessageEmbed().setColor('#000099').setTitle(':musical_note: Queue ended');
                    return await message.say({ embed });
                }
            });

            dispatcher.on('error', err => {
                message.guild.music.queue = [];
                message.guild.music.isPlaying = false;
                message.guild.music.nowPlaying = false;
                message.guild.music.dispatcher = null;
                voiceChannel.leave();
                throw err;
            });
        } catch (err) {
            console.error(err);
            const embed = new MessageEmbed().setColor('#ff0000').setTitle(':x: Error occured, if you are my creator please fix me soon');
            return message.say({ embed });
        }
    }
}