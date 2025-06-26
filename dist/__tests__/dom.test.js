import createElement from '../dom.js';
describe('createElement', () => {
    test('creates DOM structure', () => {
        const container = document.createElement('div');
        const el = createElement('div', {
            id: 'root',
            children: {
                span: { textContent: 'child' },
            },
        }, container);
        expect(container.firstChild).toBe(el);
        expect(el.id).toBe('root');
        expect(el.querySelector('span')?.textContent).toBe('child');
    });
});
