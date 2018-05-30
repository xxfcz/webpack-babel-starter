/**
 * Inspired by https://github.com/topheman/react-es6-redux
 */

const path = require('path')
const log = require('npmlog')
log.level = 'silly'
const webpack = require('webpack')
const ExtractTextPlugin = require('extract-text-webpack-plugin')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const myLocalIp = require('my-local-ip')
const AppCachePlugin = require('appcache-webpack-plugin')
const common = require('./common')
const plugins = []

const BANNER = common.getBanner()
const BANNER_HTML = common.getBannerHtml()

const root = __dirname

const MODE_DEV_SERVER =
  process.argv[1].indexOf('webpack-dev-server') > -1 ? true : false

log.info(
  'webpack',
  'Launched in ' + (MODE_DEV_SERVER ? 'dev-server' : 'build') + ' mode'
)

/** environment setup */

const BUILD_DIR = './build'
const DIST_DIR = process.env.DIST_DIR || 'dist' // relative to BUILD_DIR
const NODE_ENV = process.env.NODE_ENV
  ? process.env.NODE_ENV.toLowerCase()
  : 'development'
const DEVTOOLS = process.env.DEVTOOLS ? JSON.parse(process.env.DEVTOOLS) : null // can be useful in case you have web devtools (null by default to differentiate from true or false)
// optimize in production by default - otherwize, override with OPTIMIZE=false flag (if not optimized, sourcemaps will be generated)
const OPTIMIZE = process.env.OPTIMIZE
  ? JSON.parse(process.env.OPTIMIZE)
  : NODE_ENV === 'production'
const LINTER = process.env.LINTER ? JSON.parse(process.env.LINTER) : true
const FAIL_ON_ERROR = process.env.FAIL_ON_ERROR
  ? JSON.parse(process.env.FAIL_ON_ERROR)
  : !MODE_DEV_SERVER // disabled on dev-server mode, enabled in build mode
const STATS = process.env.STATS ? JSON.parse(process.env.STATS) : false // to output a stats.json file (from webpack at build - useful for debuging)
const LOCALHOST = process.env.LOCALHOST
  ? JSON.parse(process.env.LOCALHOST)
  : true
const ASSETS_LIMIT =
  typeof process.env.ASSETS_LIMIT !== 'undefined'
    ? parseInt(process.env.ASSETS_LIMIT, 10)
    : 5000 // limit bellow the assets will be inlines
const hash =
  (NODE_ENV === 'production' && DEVTOOLS ? '-devtools' : '') +
  (NODE_ENV === 'production' ? '-[hash]' : '')
const APPCACHE = process.env.APPCACHE
  ? JSON.parse(process.env.APPCACHE)
  : !MODE_DEV_SERVER // if false, nothing will be cached by AppCache

/** integrity checks */

if (/^\w+/.test(DIST_DIR) === false || /\/$/.test(DIST_DIR) === true) {
  // @todo make a better regexp that accept valid unicode leading chars
  log.error(
    'webpack',
    `DIST_DIR should not contain trailing slashes nor invalid leading chars - you passed "${DIST_DIR}"`
  )
  process.exit(1)
}

log.info('webpack', `${NODE_ENV.toUpperCase()} mode`)
if (DEVTOOLS) {
  log.info('webpack', 'DEVTOOLS active')
}
if (!OPTIMIZE) {
  log.info('webpack', 'SOURCEMAPS activated')
}
if (FAIL_ON_ERROR) {
  log.info('webpack', 'NoErrorsPlugin disabled, build will fail on error')
}

/** plugins setup */

if (!FAIL_ON_ERROR) {
  plugins.push(new webpack.NoEmitOnErrorsPlugin())
}

/**
 * AppCache setup - generates a manifest.appcache file based on config
 * that will be referenced in the iframe-inject-appcache-manifest.html file
 * which will itself be in an iframe tag in the index.html file
 *
 * Reason: So that index.html wont be cached
 * (if it were the one referencing manifest.appcache, it would be cached, and we couldn't manage FALLBACK correctly)
 * TLDR: AppCache sucks, but it's the only offline cross-browser "API"
 */
const appCacheConfig = {
  network: ['*'],
  settings: ['prefer-online'],
  output: 'manifest.appcache'
}
if (APPCACHE) {
  // regular appcache manifest
  plugins.push(
    new AppCachePlugin(
      Object.assign({}, appCacheConfig, {
        exclude: [
          /.*\.map$/,
          /^main(.*)\.js$/ // this is the js file emitted from webpack for main.css (since it's used in plain css, no need for it)
        ],
        fallback: ['. offline.html']
      })
    )
  )
} else {
  // appcache manifest that wont cache anything (to be used in development)
  plugins.push(
    new AppCachePlugin(
      Object.assign({}, appCacheConfig, {
        exclude: [/.*$/]
      })
    )
  )
  if (MODE_DEV_SERVER) {
    log.info(
      'webpack',
      `[AppCache] No resources added to cache in development mode`
    )
  } else {
    log.info(
      'webpack',
      `[AppCache] Cache resetted - nothing will be cached by AppCache`
    )
  }
}

const htmlPluginConfig = {
  title: 'Topheman - Webpack Babel Starter Kit',
  template: 'src/index.ejs', // Load a custom template
  inject: MODE_DEV_SERVER, // inject scripts in dev-server mode - in build mode, use the template tags
  MODE_DEV_SERVER: MODE_DEV_SERVER,
  DEVTOOLS: DEVTOOLS,
  BANNER_HTML: BANNER_HTML
}

// generate iframe-inject-appcache-manifest.html - injected via iframe in index.html
// (so that it won't be cached by appcache - otherwise, referencing manifest directly would automatically cache it)
plugins.push(
  new HtmlWebpackPlugin(
    Object.assign({}, htmlPluginConfig, {
      template: 'src/iframe-inject-appcache-manifest.ejs',
      filename: 'iframe-inject-appcache-manifest.html'
    })
  )
)

// generate index.html
plugins.push(
  new HtmlWebpackPlugin(
    Object.assign({}, htmlPluginConfig, {
      MODE: 'online'
    })
  )
)
// generate offline.html
plugins.push(
  new HtmlWebpackPlugin(
    Object.assign({}, htmlPluginConfig, {
      MODE: 'offline',
      filename: 'offline.html'
    })
  )
)

// extract css into one main.css file
const extractSass = new ExtractTextPlugin({
  filename: `main${hash}.css`,
  disable: false,
  allChunks: true
})
plugins.push(extractSass)
plugins.push(new webpack.BannerPlugin(BANNER))
plugins.push(
  new webpack.DefinePlugin({
    // Lots of library source code (like React) are based on process.env.NODE_ENV
    // (all development related code is wrapped inside a conditional that can be dropped if equal to "production"
    // this way you get your own react.min.js build)
    'process.env': {
      NODE_ENV: JSON.stringify(NODE_ENV),
      DEVTOOLS: DEVTOOLS, // You can rely on this var in your code to enable specific features only related to development (that are not related to NODE_ENV)
      LINTER: LINTER // You can choose to log a warning in dev if the linter is disabled
    }
  })
)

if (OPTIMIZE) {
  plugins.push(
    new webpack.optimize.UglifyJsPlugin({
      compress: {
        warnings: true
      }
    })
  )
}

if (NODE_ENV !== 'production') {
  // to keep compatibility with old loaders - debug: true was previously on config
  plugins.push(
    new webpack.LoaderOptionsPlugin({
      debug: true
    })
  )
}

if (MODE_DEV_SERVER) {
  // webpack-dev-server mode
  if (LOCALHOST) {
    log.info('webpack', 'Check http://localhost:8080')
  } else {
    log.info('webpack', 'Check http://' + myLocalIp() + ':8080')
  }
} else {
  // build mode
  log.info('webpackbuild', `rootdir: ${root}`)
  if (STATS) {
    //write infos about the build (to retrieve the hash) https://webpack.github.io/docs/long-term-caching.html#get-filenames-from-stats
    plugins.push(function() {
      this.plugin('done', function(stats) {
        require('fs').writeFileSync(
          path.join(__dirname, BUILD_DIR, DIST_DIR, 'stats.json'),
          JSON.stringify(stats.toJson())
        )
      })
    })
  }
}

/** preloaders */

const preLoaders = []

if (LINTER) {
  log.info('webpack', 'LINTER ENABLED')
  preLoaders.push({
    test: /\.js$/,
    exclude: /node_modules/,
    loader: 'eslint-loader',
    enforce: 'pre'
  })
} else {
  log.info('webpack', 'LINTER DISABLED')
}

/** webpack config */

const config = {
  bail: FAIL_ON_ERROR,
  entry: {
    bundle: './src/bootstrap.js',
    main: './src/style/main.scss'
  },
  output: {
    publicPath: '',
    filename: `[name]${hash}.js`,
    chunkFilename: `[id]${hash}.chunk.js`,
    path: path.join(__dirname, BUILD_DIR, DIST_DIR)
  },
  cache: true,
  devtool: OPTIMIZE ? false : 'sourcemap',
  devServer: {
    host: LOCALHOST ? 'localhost' : myLocalIp()
  },
  module: {
    rules: [
      ...preLoaders,
      {
        test: /\.js$/,
        exclude: /node_modules/,
        loader: 'babel-loader'
      },
      {
        test: /\.(s)?css/,
        use: extractSass.extract({
          use: [
            {
              loader: 'css-loader',
              query: JSON.stringify({
                sourceMap: true
              })
            },
            {
              loader: 'sass-loader',
              query: JSON.stringify({
                sourceMap: true
              })
            }
          ],
          // use style-loader in development
          fallback: 'style-loader'
        })
      },
      {
        test: /\.(png)$/,
        loader: 'url-loader?limit=' + ASSETS_LIMIT + '&name=assets/[hash].[ext]'
      },
      {
        test: /\.woff(\?v=\d+\.\d+\.\d+)?$/,
        loader:
          'url-loader?limit=' +
          ASSETS_LIMIT +
          '&mimetype=application/font-woff&name=assets/[hash].[ext]'
      },
      {
        test: /\.woff2(\?v=\d+\.\d+\.\d+)?$/,
        loader:
          'url-loader?limit=' +
          ASSETS_LIMIT +
          '&mimetype=application/font-woff&name=assets/[hash].[ext]'
      },
      {
        test: /\.ttf(\?v=\d+\.\d+\.\d+)?$/,
        loader:
          'url-loader?limit=' +
          ASSETS_LIMIT +
          '&mimetype=application/octet-stream&name=assets/[hash].[ext]'
      },
      {
        test: /\.eot(\?v=\d+\.\d+\.\d+)?$/,
        loader: 'file-loader?&name=assets/[hash].[ext]'
      },
      {
        test: /\.svg(\?v=\d+\.\d+\.\d+)?$/,
        loader:
          'url-loader?limit=' +
          ASSETS_LIMIT +
          '&mimetype=image/svg+xml&&name=assets/[hash].[ext]'
      }
    ]
  },
  plugins: plugins,
  node: {
    console: true,
    fs: 'empty',
    net: 'empty',
    tls: 'empty'
  }
}

module.exports = config
