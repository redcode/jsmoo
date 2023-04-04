import {
    console_mt_struct,
    input_map_keypoint,
    machine_description,
    MD_STANDARD,
    MD_TIMING,
    systemEmulator
} from "../interface"
import {dbg} from "../../helpers/debug";
import {framevars_t} from "../../glue/global_player";
import {bigstr_output} from "../../component/cpu/r3000/r3000";
import {flatNES} from "./allnes";
import {NES_VARIANTS} from "../nes/nes_common";
import {nespad_inputs} from "../nes/nes";

let NES_inputmap: Array<input_map_keypoint> = new Array<input_map_keypoint>(16);
// p1                                    p2
// Up down left right a b start select

function fill_NES_inputmap(): void {
    for (let i = 0; i < 16; i++) {
        let kp = new input_map_keypoint();
        let uber: String = (i < 8) ? 'p1' : 'p2';
        kp.internal_code = i;
        kp.buf_pos = i;
        kp.uber = uber;
        switch(i) {
            case 0:
            case 8:
                kp.name = 'up';
                break;
            case 1:
            case 9:
                kp.name = 'down';
                break;
            case 2:
            case 10:
                kp.name = 'left';
                break;
            case 3:
            case 11:
                kp.name = 'right';
                break;
            case 4:
            case 12:
                kp.name = 'a';
                break;
            case 5:
            case 13:
                kp.name = 'b';
                break;
            case 6:
            case 14:
                kp.name = 'start';
                break;
            case 7:
            case 15:
                kp.name = 'select';
                break;
        }
        NES_inputmap[i] = kp;
    }
}
fill_NES_inputmap();

export class NES implements systemEmulator {
    emu: flatNES
    variant: NES_VARIANTS
    cycles_left: i32 = 0
    decode_array: StaticArray<u32> = new StaticArray<u32>(16);
    controller1_in: nespad_inputs = new nespad_inputs();
    controller2_in: nespad_inputs = new nespad_inputs();
    framevars: framevars_t = new framevars_t();

    constructor(variant: NES_VARIANTS, out_buffer: usize) {
        this.variant = variant
        this.cycles_left = 0;
        this.emu = new flatNES(variant, out_buffer)
    }

    play(): void {};
    pause(): void {};
    stop(): void {};
    dump_debug(): bigstr_output {
        return new bigstr_output();
    }
    get_mt_struct(): console_mt_struct {
        return new console_mt_struct();
    }


    map_inputs(bufptr: usize): void {
        // Hardcoded yo!
        this.controller1_in.up = load<u32>(bufptr);
        this.controller1_in.down = load<u32>(bufptr+(4));
        this.controller1_in.left = load<u32>(bufptr+(4*2));
        this.controller1_in.right = load<u32>(bufptr+(4*3));
        this.controller1_in.a = load<u32>(bufptr+(4*4));
        this.controller1_in.b = load<u32>(bufptr+(4*5));
        this.controller1_in.start = load<u32>(bufptr+(4*6));
        this.controller1_in.select = load<u32>(bufptr+(4*7));
        this.controller2_in.up = load<u32>(bufptr+(4*8));
        this.controller2_in.down = load<u32>(bufptr+(4*9));
        this.controller2_in.left = load<u32>(bufptr+(4*101));
        this.controller2_in.right = load<u32>(bufptr+(4*11));
        this.controller2_in.a = load<u32>(bufptr+(4*12));
        this.controller2_in.b = load<u32>(bufptr+(4*13));
        this.controller2_in.start = load<u32>(bufptr+(4*14));
        this.controller2_in.select = load<u32>(bufptr+(4*15));
        this.emu.cpu_update_inputs(this.controller1_in, this.controller2_in);
    }

    get_framevars(): framevars_t {
        this.framevars.master_frame = this.emu.clock_master_frame;
        this.framevars.x = this.emu.ppu_line_cycle;
        this.framevars.scanline = this.emu.clock_ppu_y;
        return this.framevars;
    }

    get_description(): machine_description {
        let d = new machine_description();
        d.name = 'Nintendo Entertainment System';
        d.fps = 60;
        d.timing = MD_TIMING.frame;
        d.standard = MD_STANDARD.NTSC;
        d.x_resolution = 256;
        d.y_resolution = 240;
        d.xrh = 8;
        d.xrw = 7;

        d.overscan.top = 8;
        d.overscan.bottom = 8;
        d.overscan.left = 8;
        d.overscan.right = 8;

        d.out_size = (256*240*2);

        for (let i = 0, k = NES_inputmap.length; i < k; i++) {
            d.keymap.push(NES_inputmap[i]);
        }
        return d;
    }

    killall(): void {
    }

    finish_frame(): u32 {
        let current_frame: u64 = this.emu.clock_master_frame;
        while (this.emu.clock_master_frame === current_frame) {
            this.finish_scanline();
            if (dbg.do_break) break;
        }
        return 0;
    }

    finish_scanline(): u32 {
        let cpu_step: u32 = this.emu.timing_cpu_divisor;
        let ppu_step: u32 = this.emu.timing_ppu_divisor;
        let done: u32 = 0;
        let start_y: u32 = this.emu.clock_ppu_y;
        while (this.emu.clock_ppu_y === start_y) {
            this.emu.clock_master_clock += cpu_step;
            this.emu.cpu_run_cycle();
            this.emu.mapper_cycle(this.emu,1);
            this.emu.clock_cpu_frame_cycle++;
            this.emu.clock_cpu_master_clock += cpu_step;
            let ppu_left = this.emu.clock_master_clock - this.emu.clock_ppu_master_clock;
            done = 0;
            while (ppu_left >= ppu_step) {
                ppu_left -= ppu_step;
                done++;
            }
            this.emu.ppu_cycle(done);
            this.cycles_left -= cpu_step;
            if (dbg.do_break) break;
        }
        return 0;
    }

    step_master(cycles: u32): u32 {
        console.log('MASTER STEPS NOT SUPPORTED NES AS YET');
        return 0;
    }

    reset(): void {
        this.emu.cpu_reset();
        //this.ppu.reset();
        this.emu.reset();
    }

    // NES has no BIOS
    load_BIOS(what: usize, sz: u32): void {
    }

    load_ROM(name: string, what: usize, sz: u32): void {
        this.emu.cart_load_cart_from_RAM(what, sz);
        this.reset();
    }
}


