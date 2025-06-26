import Player from '../player.js';
describe('Player', () => {
    const createMedia = () => {
        const media = document.createElement('audio');
        media.play = jest.fn().mockResolvedValue(undefined);
        media.pause = jest.fn();
        media.setSinkId = jest.fn().mockResolvedValue(undefined);
        return media;
    };
    test('play and pause', async () => {
        const media = createMedia();
        const player = new Player({ media });
        await player.play();
        expect(media.play).toHaveBeenCalled();
        player.pause();
        expect(media.pause).toHaveBeenCalled();
    });
    test('volume and muted', () => {
        const media = createMedia();
        const player = new Player({ media });
        player.setVolume(0.5);
        expect(player.getVolume()).toBe(0.5);
        player.setMuted(true);
        expect(player.getMuted()).toBe(true);
    });
    test('setTime clamps to duration', () => {
        const media = createMedia();
        Object.defineProperty(media, 'duration', { configurable: true, value: 10 });
        const player = new Player({ media });
        player.setTime(-1);
        expect(player.getCurrentTime()).toBe(0);
        player.setTime(11);
        expect(player.getCurrentTime()).toBe(10);
    });
    test('setSinkId uses media method', async () => {
        const media = createMedia();
        const player = new Player({ media });
        await player.setSinkId('id');
        expect(media.setSinkId).toHaveBeenCalledWith('id');
    });
});
