// webpack.config.js
var webpack = require('webpack');
var path = require('path');
const TerserPlugin = require("terser-webpack-plugin");

module.exports = {
  devtool: 'source-map',
  entry: {
    main:'./src/ReactSuperSimpleScroller.tsx'
  },
  output: {
    filename: 'build.js',
    path: path.resolve('dist'),
    library:'react-super-simple-scroller',
    libraryTarget:'umd',
    globalObject: 'this',
    clean:true
  },
  resolve: {
    extensions: ['.tsx', '.js'],
    modules: ['src', 'node_modules']
  },
  module: {
    rules: [
      { 
          test: /\.tsx?$/, 
          use:['ts-loader']
      }
      ]
  },
  externals: {
      react: 'react',
      "react-dom": 'react-dom'
  },
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin()],
  },
};