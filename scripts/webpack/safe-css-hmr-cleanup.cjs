// Next 16.3.x's bundled mini-css HMR runtime removes the old link after
// its replacement loads. Webpack/React may already have removed that link.
// Transform only this dev-client module; never patch DOM prototypes or suppress errors.
module.exports = function safeCssHmrCleanup(source) {
  return source.replace(
    /\b([A-Za-z_$][\w$]*)\.parentNode\.removeChild\(\1\)/g,
    "$1.parentNode && $1.parentNode.removeChild($1)",
  );
};
