const { HciMODblue } = require('../lib/hci');
const { DbusMODblue } = require('../lib/dbus');

const USAGE = `
Usage:
	node ./tests/advertise.js <bindings> [name]
Arguments:
	bindings:        Bindings to use: "hci" or "dbus"
	name:            Advertised device name
`;

const BINDINGS = process.argv[2];
const NAME = process.argv[3] || 'MODblue TEST';

const printUsage = () => console.log(USAGE);

const main = async () => {
	if (!BINDINGS || !NAME) {
		throw new Error(printUsage());
	}

	console.log('Initializing MODblue...');

	const modblue = BINDINGS === 'hci' ? new HciMODblue() : BINDINGS === 'dbus' ? new DbusMODblue() : null;
	if (!modblue) {
		throw new Error(`Could not find requested bindings ${BINDINGS}`);
	}

	console.log('Getting adapters...');

	const adapters = await modblue.getAdapters();
	if (adapters.length === 0) {
		throw new Error('No adapters found');
	}

	const adapter = adapters[0];
	adapter.on('connect', (p) => console.log(p.address, 'connected'));
	adapter.on('disconnect', (p) => console.log(p.address, 'disconnected'));
	console.log(`Using adapter ${adapter.id}`);

	const gatt = await adapter.setupGatt();
	const srv = await gatt.addService('6e40ff015fe146a893309b4670ca5106');
	await srv.addCharacteristic('6e40ff025fe146a893309b4670ca5106', ['write'], [], Buffer.from('test', 'utf-8'));
	await srv.addCharacteristic('6e40ff035fe146a893309b4670ca5106', ['notify'], [], async (offset) => {
		return [0, Buffer.from('other', 'utf-8').slice(offset)];
	});

	console.log('Starting advertisement...');
	const address = ('01'+adapter.address.replaceAll(':','')).padEnd(26,'0');
	await adapter.startAdvertising(NAME, ['6e40ff015fe146a893309b4670ca5106']);
	console.log(`Advertising as ${adapter.address}...`);
};

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
