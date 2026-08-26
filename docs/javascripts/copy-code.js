// Adds a "Copy" button to every fenced code block, since the plain mkdocs
// theme (unlike mkdocs-material) has no built-in click-to-copy.
document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('pre > code').forEach(function (code) {
        var pre = code.parentElement;
        pre.style.position = 'relative';

        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'copy-code-button';
        button.textContent = 'Copy';
        button.setAttribute('aria-label', 'Copy code to clipboard');
        button.style.cssText =
            'position:absolute;top:0.4em;right:0.4em;padding:0.2em 0.6em;' +
            'font-size:0.75em;line-height:1.4;cursor:pointer;border-radius:4px;' +
            'border:1px solid rgba(127,127,127,0.4);background:rgba(127,127,127,0.15);' +
            'color:inherit;opacity:0.85;';

        button.addEventListener('click', function () {
            var text = code.innerText
                .split('\n')
                .filter(function (line) {
                    return line.trim().charAt(0) !== '#';
                })
                .join('\n')
                .trim();
            navigator.clipboard.writeText(text).then(
                function () {
                    var original = button.textContent;
                    button.textContent = 'Copied!';
                    setTimeout(function () {
                        button.textContent = original;
                    }, 1500);
                },
                function () {
                    button.textContent = 'Failed';
                    setTimeout(function () {
                        button.textContent = 'Copy';
                    }, 1500);
                }
            );
        });

        pre.appendChild(button);
    });
});
