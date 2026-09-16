/* Find & replace core for the Markdown mirror.
   Structural dc:* marker lines (and the doc-compiler header) are never
   touched: they carry the block ids and Word styles that the exporter
   relies on, and they are not user-visible content. */
(function (root) {
  "use strict";

  // Only full-line structural comments are protected — the same set the
  // server-side parser skips (dc:block, dc:blank, dc:page-break, dc:opaque,
  // doc-compiler header). Any other comment-looking line is content.
  var MARKER_LINE = /^\s*<!--\s*(?:dc:(?:block|blank|page-break|opaque)\b|doc-compiler:)/;

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function buildRegExp(find, caseSensitive, wholeWord) {
    var source = escapeRegExp(find);
    if (wholeWord) {
      source = "(?<![\\p{L}\\p{N}_])" + source + "(?![\\p{L}\\p{N}_])";
    }
    return new RegExp(source, (caseSensitive ? "g" : "gi") + "u");
  }

  function assertOptions(options) {
    var config = options || {};
    if (typeof config.find !== "string" || !config.find) {
      return null;
    }
    return {
      find: config.find,
      replace: typeof config.replace === "string" ? config.replace : "",
      caseSensitive: Boolean(config.caseSensitive),
      wholeWord: Boolean(config.wholeWord),
    };
  }

  function findMatches(markdown, options) {
    var config = assertOptions(options);
    var matches = [];
    if (!config) {
      return matches;
    }
    var regex = buildRegExp(config.find, config.caseSensitive, config.wholeWord);
    var offset = 0;
    markdown.split("\n").forEach(function (line) {
      if (!MARKER_LINE.test(line)) {
        regex.lastIndex = 0;
        var match;
        while ((match = regex.exec(line)) !== null) {
          matches.push({ start: offset + match.index, end: offset + match.index + match[0].length });
          if (match[0].length === 0) {
            break;
          }
        }
      }
      offset += line.length + 1;
    });
    return matches;
  }

  function replaceInMarkdown(markdown, options) {
    var config = assertOptions(options);
    if (!config) {
      return { result: markdown, count: 0 };
    }
    // The replacer is a function, so the replacement is inserted literally:
    // '$' insertion patterns ($&, $', $$...) never apply.
    var lines = markdown.split("\n");
    var count = 0;
    var result = lines
      .map(function (line) {
        if (MARKER_LINE.test(line)) {
          return line;
        }
        return line.replace(buildRegExp(config.find, config.caseSensitive, config.wholeWord), function () {
          count += 1;
          return config.replace;
        });
      })
      .join("\n");
    return { result: result, count: count };
  }

  var api = { findMatches: findMatches, replaceInMarkdown: replaceInMarkdown };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.ReplaceMarkdown = api;
})(typeof window !== "undefined" ? window : globalThis);
