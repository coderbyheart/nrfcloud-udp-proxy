const fs = require('fs')
const path = require('path')
const webpack = require('webpack')

const cfg = {
	entry: {
		main: './web/index.tsx',
	},
	resolve: {
		extensions: ['.ts', '.tsx', '.js'],
	},
	module: {
		rules: [
			{
				test: /\.ts(x?)$/,
				exclude: /node_modules/,
				use: [
					{
						loader: 'ts-loader',
						options: {
							configFile: 'web/tsconfig.json',
						},
					},
				],
			},
			{
				test: /\.svg$/,
				use: ['svg-inline-loader'],
			},
		],
	},
	plugins: [new webpack.EnvironmentPlugin(['PROXY_ENDPOINT'])],
}

module.exports = [
	{
		...cfg,
		mode: 'production',
		name: 'production',
	},
	{
		...cfg,
		name: 'development',
		mode: 'development',
		devtool: 'source-map',
		devServer: {
			contentBase: './web',
			port: 8081,
			before: (app, server, compiler) => {
				app.get('/', (req, res) => {
					const html = fs.readFileSync(
						path.join(process.cwd(), 'web', 'index.html'),
						'utf-8',
					)
					res.set('Content-Type', 'text/html')
					res.send(html)
				})
			},
		},
		module: {
			rules: [
				...cfg.module.rules,
				{
					enforce: 'pre',
					test: /\.js$/,
					loader: 'source-map-loader',
				},
			],
		},
	},
]
