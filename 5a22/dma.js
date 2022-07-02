"use strict";

class r5a22DMAChannel {
    constructor() {
        this.reverse_transfer = 0;
        this.HDMA_indirect_addressing = 0;
        this.unused_bit_43x0 = 0;
        this.a_address_fixed = 0;
        this.a_address_decrement = 0;
        this.transfer_mode = 0;
        this.b_address = 0;
        this.a_address = 0;
        this.a_bank = 0;
        this.dma_count_or_hdma_indirect_address = 0;
        this.indirect_bank = 0;
        this.address = 0;
        this.repeat = 0;
        this.line_count = 0;
        this.unknown_byte = 0;
        this.do_transfer = 0;
    }
}

const HDMA_LENGTHS = Object.freeze([1, 2, 2, 4, 4, 4, 2, 4]);

class dmaChannel {
    /**
     * @param {snes_memmap} mem_map
     * @param {ricoh5A22.dma_edge} dma_edge
     * @param {*} status
     */
    constructor(mem_map, dma_edge, status, counters) {
        this.mem_map = mem_map;
        this.dma_enable = 0;
        this.status = status;
        this.hdma_enable = 0;
        this.direction = 0;
        this.indirect = 0;
        this.unused = 0;
        this.reverse_transfer = 0;
        this.fixed_transfer = 0;
        this.transfer_mode = 0;
        this.target_address = 0;
        this.source_address = 0;
        this.source_bank = 0;
        this.transfer_size = 0;
        this.indirect_bank = 0;
        this.indirect_address = 0;
        this.hdma_address = 0;
        this.line_counter = 0;
        this.hdma_completed = 0;
        this.hdma_do_transfer = 0;
        this.next = null;
        this.dma_edge = dma_edge;
        this.took_cycles = 0;
        this.counters = counters;
    }

    hdma_is_active() {
        return this.hdma_enable && !this.hdma_completed;
    }

    hdma_reset() {
        this.hdma_completed = false;
        this.hdma_do_transfer = false;
    }

    dma_run() {
        if (!this.dma_enable) return;

        this.counters.dma += 8;
        //this.dma_edge();

        let index = 0;
        if (this.transfer_size > 0) {
            do {
                this.transfer(this.source_bank << 16 | this.source_address, index);
                index++;
                //this.dma_edge()
            } while (this.dma_enable && --this.transfer_size);
        }

        this.dma_enable = false;
    }

    hdma_setup() {
        this.hdma_do_transfer = true;
        if (this.hdma_enable) return;

        this.dma_enable = false;
        this.hdma_address = this.source_address;
        this.line_counter = 0;
        this.hdma_reload();
    }

    hdma_is_finished() {
        let channel = this.next;
        while(channel !== null) {
            if (channel.hdma_is_active()) return false;
            channel = channel.next;
        }
        return true;
    }

    hdma_reload() {
        let data = this.mem_map.dispatch_read(this.source_bank << 16 | this.hdma_address);
        if ((this.line_counter & 0x7F) === 0) {
            this.line_counter = data;
            this.hdma_address++;

            this.hdma_completed = +(this.line_counter === 0);
            this.hdma_do_transfer = !this.hdma_completed;

            if (this.indirect) {
                data = this.mem_map.dispatch_read(this.source_bank << 16 | this.hdma_address);
                this.hdma_address++;
                this.indirect_address = data << 8;
                if (this.hdma_completed && this.hdma_is_finished()) return;

                data = this.mem_map.dispatch_read(this.source_bank << 16 | this.hdma_address);
                this.hdma_address++;
                this.indirect_address = (data << 8) | (this.indirect_address >>> 8);
            }
        }
    }

    hdma_advance() {
        if (!this.hdma_is_active()) return;
        this.line_counter--;
        this.hdma_do_transfer = (this.line_counter & 0x80) >>> 7;
        this.hdma_reload();
    }

    hdma_transfer() {
        if (!this.hdma_is_active()) return;
        this.dma_enable = false; // HDMA interrupt DMA
        if (!this.hdma_do_transfer) return;
        for (let index = 0; index < lengths[this.transfer_mode]; index++) {
            let addr;
            if (this.indirect) {
                addr = (this.indirect_bank << 16) | this.indirect_address;
                this.indirect_address++;
            } else {
                addr = (this.source_bank << 16) | this.source_address;
                this.source_address++;
            }
            this.transfer(addr, index)
        }
    }

    validA(addr) {
        if ((addr & 0x40FF00) === 0x2100) return false;
        if ((addr & 0x40FE00) === 0x4000) return false;
        if ((addr & 0x40FFE0) === 0x4200) return false;
        return (addr & 0x40FF80) !== 0x4300;
    }

    readA(addr) {
        this.counters.dma += 8;
        return this.validA(addr) ? this.mem_map.dispatch_read(addr) : 0
    }

    readB(addr, valid) {
        this.counters.dma += 8;
        return valid ? this.mem_map.dispatch_read(0x2100 | addr) : 0
    }

    writeA(addr, val) {
        if (this.validA(addr)) this.mem_map.dispatch_write(addr, val);
    }

    writeB(addr, val, valid) {
        if (valid) this.mem_map.dispatch_write(2100 | addr, val);
    }

    transfer(addrA, index) {
        let addrB = this.target_address;
        switch(this.transfer_mode) {
            case 1:
            case 5:
                addrB += (index & 1); break;
            case 3:
            case 7:
                addrB += ((index >>> 1)) & 1; break;
            case 4:
                addrB += index; break;
        }
        let valid = addrB !== 0x80 || ((addrA & 0xFE0000) !== 0x7E0000 && (addrA & 0x40E000) !== 0x0000);
        let data;
        if (this.direction === 0) {
            data = this.readA(addrA);
            this.writeB(addrB, data, valid);
        } else {
            data = this.readB(addrB, valid);
            this.writeA(addrA, data);
        }
    }
}


class r5a22DMA {
    /**
     * @param {snes_memmap} mem_map
     * @param {ricoh5A22.dma_edge} dma_edge
     * @param {*} status
     * @param {*} counters
     */
    constructor(mem_map, dma_edge, status, counters) {
        this.mem_map = mem_map;

        this.status = status;
        this.counters = counters;

        this.dma_setup_triggered = false;
        this.dma_edge = dma_edge;

        this.channels = [];
        for (let i = 0; i < 8; i++) {
            this.channels.push(new dmaChannel(this.mem_map, this.dma_edge, this.status, this.counters));
        }
        for (let i = 0; i < 8; i++) {
            if (i !== 7) this.channels[i].next = this.channels[i+1];
        }
    }

    reset() {

    }

    reg_read(addr, val, have_effect=true) {
        let channel = this.channels[((addr >>> 4) & 7)];

        switch(addr & 0xFF8F) {
            case 0x4300: // DMAPx
                return (channel.transfer_mode) | (channel.fixed_transfer << 3) | (channel.reverse_transfer << 4) | (channel.unused << 5) | (channel.indirect << 6) || (channel.direction << 7);
            case 0x4301:
                return channel.target_address;
            case 0x4302:
                return channel.source_address & 0xFF;
            case 0x4303:
                return (channel.source_address >>> 8) & 0xFF;
            case 0x4304:
                return channel.source_bank;
            case 0x4305:
                return channel.transfer_size & 0xFF;
            case 0x4306:
                return (channel.transfer_size >>> 8) & 0xFF;
            case 0x4307:
                return channel.indirect_bank;
            case 0x4308:
                return channel.hdma_address & 0xFF;
            case 0x4309:
                return (channel.hdma_address >>> 8) & 0xFF;
            case 0x430a:
                return channel.line_counter;
            case 0x430b:
                return channel.unknown_byte;
            case 0x430f:
                return channel.unknown_byte;
        }
        return val;
    }

    reg_write(addr, val) {
        let channel = this.channels[((addr >>> 4) & 7)];
        switch(addr & 0xFF8F) {
            case 0x4300: // DMAPx varios controls
                channel.transfer_mode = val & 7;
                channel.fixed_transfer = (val >>> 3) & 1;
                channel.reverse_transfer = (val >>> 4) & 1;
                channel.unused = (val >>> 5) & 1;
                channel.indirect = (val >>> 6) & 1;
                channel.direction = (val >>> 7) & 1;
                return;

            case 0x4301:
                channel.target_address = val;
                return;
            case 0x4302:
                channel.source_address = (channel.source_address & 0xFF00) | val;
                return;
            case 0x4303:
                channel.source_address = (val << 8) | (channel.source_address & 0xFF);
                return;
            case 0x4304:
                channel.source_bank = val;
                return;
            case 0x4305:
                channel.transfer_size = (channel.transfer_size & 0xFF00) | val;
                return;
            case 0x4306:
                channel.transfer_size = (val << 8) | (channel.transfer_size & 0xFF);
                return;
            case 0x4307:
                channel.indirect_bank = val;
                return;
            case 0x4308:
                channel.hdma_address = (channel.hdma_address & 0xFF00) | val;
                return;
            case 0x4309:
                channel.hdma_address = (val << 8) | (channel.hdma_address & 0xFF);
                return;
            case 0x430A:
                channel.line_counter = val;
                return;
            case 0x430B:
                channel.unknown = val;
                return;
            case 0x430F:
                channel.unknown = val;
                return;
        }
    }

    hdma_run() {
        this.counters.dma += 8;
        for (let n = 0; n < 8; n++) {
            this.channels[n].hdma_transfer();
        }
        for (let n = 0; n < 8; n++) {
            this.channels[n].hdma_advance();
        }
        this.status.irq_lock = 1;
    }

    dma_run() {
        this.counters.dma += 8;
        //this.dma_edge();
        for (let n = 0; n < 8; n++) { this.channels[n].dma_run(); }
        this.status.irq_lock = true;
    }

    hdma_setup() {
        this.counters.dma += 8;
        for (let n = 0; n < 8; n++) { this.channels[n].hdma_setup(); }
        this.status.irq_lock = true;
    }


}