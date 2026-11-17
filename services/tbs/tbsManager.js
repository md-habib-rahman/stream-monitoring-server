class TbsManager {
  constructor({ deviceRepository, clientFactory }) {
    if (!deviceRepository || typeof clientFactory !== "function") {
      throw new Error("TbsManager requires a device repository and client factory");
    }
    this.deviceRepository = deviceRepository;
    this.clientFactory = clientFactory;
    this.clients = new Map();
    this.devices = new Map();
    this.reloadQueue = Promise.resolve();
  }

  loadFromDatabase() {
    const reload = this.reloadQueue.catch(() => {}).then(() => this.reload());
    this.reloadQueue = reload;
    return reload;
  }

  async reload() {
    const devices =
      await this.deviceRepository.listActiveDevicesWithCredentials();
    const clients = new Map();
    const publicDevices = new Map();

    for (const device of devices) {
      clients.set(device.id, this.clientFactory(device));
      publicDevices.set(device.id, {
        id: device.id,
        name: device.name,
        host: device.host,
      });
    }

    this.clients = clients;
    this.devices = publicDevices;
    return this.listDevices();
  }

  getClient(tbsId) {
    const client = this.clients.get(tbsId);
    if (!client) {
      const error = new Error(`TBS device not found or inactive: ${tbsId}`);
      error.statusCode = 404;
      throw error;
    }
    return client;
  }

  listDevices() {
    return Array.from(this.devices.values());
  }
}

module.exports = TbsManager;
