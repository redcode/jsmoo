import {GB_mapper} from "./interface";
import {GB_bus, GB_clock} from "../gb";
import {GB_cart} from "../gb_cart";
import {GB_variants} from "../gb_common";

class GB_mapper_MBC2_regs {
    ROMB: u32 = 1
    BANK1: u32 = 1;
    BANK2: u32 = 0;
    ext_RAM_enable: u32 = 0;
    cartRAM_bank: u32 = 0;
}

export class GB_mapper_MBC2 implements GB_mapper {
    clock: GB_clock
    bus: GB_bus
    ROM: StaticArray<u8> = new StaticArray<u8>(0)
    BIOS_big: u32 = 0;
    ROM_bank_lo_offset: u32 = 0;
    ROM_bank_hi_offset: u32 = 16384;
    VRAM_bank_offset: u32 = 0;
    WRAM_bank_offset: u32 = 0x1000;

    cartRAM: StaticArray<u8> = new StaticArray<u8>(512)
    cartRAM_offset: u32 = 0;
    WRAM: StaticArray<u8> = new StaticArray<u8>(8192*8)
    HRAM: StaticArray<u8> = new StaticArray<u8>(128)
    VRAM: StaticArray<u8> = new StaticArray<u8>(32768);
    BIOS: StaticArray<u8> = new StaticArray<u8>(0);
    
    cart: GB_cart
    num_ROM_banks: u32 = 0;
    regs: GB_mapper_MBC2_regs = new GB_mapper_MBC2_regs();

    RAM_mask: u32 = 0x1FF

    constructor(clock: GB_clock, bus: GB_bus) {
        this.clock = clock;
        this.bus = bus;

        this.cart = new GB_cart(GB_variants.DMG, clock, bus);
        this.bus.mapper = this;
    }

    reset(): void {
        // This changes on other mappers for banking
        this.ROM_bank_lo_offset = 0;
        this.ROM_bank_hi_offset = 16384;
        this.cartRAM_offset = 0;
        this.regs.BANK1 = 1;
        this.regs.BANK2 = 0;
        this.regs.ext_RAM_enable = 0;
        this.regs.cartRAM_bank = 0;
        // This changes on CGB
        this.VRAM_bank_offset = 0;
        // This changes on CGB
        this.WRAM_bank_offset = 0x1000;
        this.update_banks();
    }

    CPU_read(addr: u32, val: u32): u32 {
        if ((addr >= 0xE000) && (addr < 0xFE00)) addr -= 0x2000; // WRAM mirror
        if (this.clock.bootROM_enabled) {
            if (addr < 0x100)
                return this.bus.BIOS[addr];
            if (this.BIOS_big && (addr >= 0x200) && (addr < 0x900))
                return this.bus.BIOS[addr - 0x100];
        }
        if (addr < 0x4000) // ROM lo bank
            return this.ROM[addr + this.ROM_bank_lo_offset];
        if (addr < 0x8000) // ROM hi bank
            return this.ROM[(addr & 0x3FFF) + this.ROM_bank_hi_offset];
        if (addr < 0xA000) { // VRAM, banked
            if (this.clock.CPU_can_VRAM)
                return this.VRAM[(addr & 0x1FFF) + this.VRAM_bank_offset];
            return 0xFF;
        } // cart RAM if it's there
        if (addr < 0xC000) {
            if (!this.regs.ext_RAM_enable)
                return 0xFF;
            return this.cartRAM[addr & 0x1FF] | 0xF0;
        }
        // Adjust address for mirroring
        //if ((addr > 0xE000) && (addr < 0xFE00)) return 0xFF; //addr -= 0x2000;

        if (addr < 0xD000) // WRAM lo bank
            return this.WRAM[addr & 0xFFF];
        if (addr < 0xE000) // WRAM hi bank
            return this.WRAM[(addr & 0xFFF) + this.WRAM_bank_offset];
        if (addr < 0xFF00) // OAM
            return this.bus.ppu!.read_OAM(addr);
        if (addr < 0xFF80) // registers
            return this.bus.CPU_read_IO(addr, val);
        if (addr < 0xFFFF) {// HRAM always accessible
            return this.HRAM[addr - 0xFF80];
        }
        return this.bus.CPU_read_IO(addr, val); // 0xFFFF register
    }

    // Update ROM banks
    update_banks(): void {
        this.ROM_bank_lo_offset = 0;
        this.ROM_bank_hi_offset = (this.regs.ROMB % this.num_ROM_banks) * 16384;
    }

    CPU_write(addr: u32, val: u32): void {
        if ((addr >= 0xE000) && (addr < 0xFE00)) addr -= 0x2000; // WRAM mirror
        if (addr < 0x4000) {
            switch (addr & 0x100) {
                case 0x0000: // RAM write enable
                    this.regs.ext_RAM_enable = +((val & 0x0F) === 0x0A);
                    return;
                case 0x0100: // ROM bank number
                    val &= 0x0F; // 5 bits
                    if (val === 0) val = 1; // can't be 0
                    this.regs.ROMB = val;
                    this.update_banks();
                    return;
            }
        }
        if (addr < 0xA000) { // VRAM
            if (this.clock.CPU_can_VRAM)
                this.VRAM[(addr & 0x1FFF) + this.VRAM_bank_offset] = <u8>val;
            return;
        }
        if (addr < 0xC000) { // cart RAM
            if (this.regs.ext_RAM_enable) this.cartRAM[addr & 0x1FF] = <u8>(val & 0x0F);
            return;
        }
        // adjust address for mirroring
        //if ((addr > 0xE000) && (addr < 0xFE00)) return; //addr -= 0x2000;

        if (addr < 0xD000) { // WRAM lo bank
            this.WRAM[addr & 0xFFF] = <u8>val;
            return;
        }
        if (addr < 0xE000) { // WRAM hi bank
            this.WRAM[(addr & 0xFFF) + this.WRAM_bank_offset] = <u8>val;
            return;
        }
        if (addr < 0xFF00) // OAM
            return this.bus.ppu!.write_OAM(addr, val);
        if (addr < 0xFF80) // registers
            return this.bus.CPU_write_IO(addr, val);
        if (addr < 0xFFFF) { // HRAM always accessible
            this.HRAM[addr - 0xFF80] = <u8>val;
            return;
        }
        this.bus.CPU_write_IO(addr, val); // 0xFFFF register
    }

    PPU_read(addr: u32): u32 {
        if ((addr < 0x8000) || (addr > 0x9FFF)) return 0xFF;
        return this.VRAM[(addr & 0x1FFF) + this.VRAM_bank_offset];
    }

    set_cart(cart: GB_cart, BIOS: Uint8Array): void {
        console.log('Loading MBC2 cart')
        this.cart = cart;
        this.BIOS = new StaticArray<u8>(BIOS.byteLength);
        for (let i = 0, k = BIOS.byteLength; i < k; i++) {
            this.BIOS[i] = BIOS[i];
        }
        this.BIOS_big = +(BIOS.byteLength > 256);
        this.ROM = new StaticArray<u8>(cart.header.ROM_size);
        for (let i: u32 = 0, k: u32 = cart.header.ROM_size; i < k; i++) {
            this.ROM[i] = cart.ROM[i];
        }
        this.cartRAM = new StaticArray<u8>(cart.header.RAM_size);
        this.num_ROM_banks = cart.header.ROM_size / 16384;
        this.RAM_mask = 0x1FF;
    }
}
