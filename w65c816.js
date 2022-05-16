console.log('I AM ALIVE!')

/* We're not doing every pin individually. That's an unneccessary pain.
   We will group them where we can, and leave out ones like clock.
  
   VPB goes low to indicage hardware vector addresses being accessed during an interrupt request. Also BRK and COPm during cycles 7 and 8 of interrupt acknowledgement sequence
   RDY out. As output, pulled low after WAI is executed, signaling that it is WAiting for an interrupt. Pulled high when external RES, ABORT, NMI, or IRQ happens.
   RDYf in. Input version of RDY. If forced low externally, processor will halt. If forced high externally, processor will NOT stop after WAI.
   ABORT in. Assert low, current instruction will discard its value, and an ABORT interrupt will happen.
   IRQ in. Assert low will start interrupt sequence if Disable Interrupt flag is Clear.
   ML out. pulls low during read-modify-write instructions, basically saying bus isn't in use.
   NMI in. high-to-low - not just low - starts NMI interrupt.
   VPA - out. Valid Program Address. Used with VDA in Table 1
   VDD - in. IF set to 0, processor will not function and will lose all state.
   A: out. 16-bit address, or 0xFFFF if BE is high.
   VSS: out. ground. NOT EMULATED
   DBA: bidirectional. Data pins D0-D7 or bank BA0-BA7. On a real WD65C816, these would change twice per cycle to indicate upper bits of 24-bit address and then communicate the contents of that, either as a write or a read. Here we dispense with that, and provide D and BA seperately. BA is set to 0 in emulation mode. Or set to 0xFF if BE is asserted.
   RWB: out. when high, processor is reading. When low, writing. Easy! This remains high during reset.
   E: out. "Emulation," Reflects state of E bit.
   BE: in. when low, Address and Data will not be exported, instead will be set to all 1's.
   MX: out. high if M and X flags are set.
   VDA: See VPA
   RESB: Set low for 2 clock cycles, will reset the processor
   
  
  VDA VPA 
   0   0   Internal operation, address is garbage
   0   1   Program address
   1   0   Valid data address
   1   1   Opcode fetch
   
   Interrupt sequence
   Emulation mode
   PCH, PCL, P
   Native mode
   PBR, PCH, PCL, P
   */ 

let EMU_IRQ = 0xFFFE
let NAT_IRQ = 0xFFEE
let EMU_NMI = 0xFFFA
let NAT_NMI = 0xFFEA
let EMUNAT_RES = 0xFFFC
let EMU_ABORT = 0xFFF8
let NAT_ABORT = 0xFFE8
let EMU_COP = 0xFFF4
let NAT_COP = 0xFFE4
let NAT_BRK = 0xFFE6
   
let BOOTUP = 256;
class w65c816_registers {
	constructor() {
		// Hidden registers used internally to track state
		this.IR = 0; // Instruction register
		this.TCU = 0; // Timing Control Unit, counts up during execution. Set to 0 at instruction fetch, incremented every cycle thereafter
		this.MD = 0; // Memory Data Register, holds last known "good" RAM value from a read
		
		// Registers exposed to programs
		this.C = 0; // B + A = C.
		this.D = 0; // Direct
		this.X = 0; // Y index
		this.Y = 0; // X index
		this.P = 0; // Processor Status
		this.PB = 0; // Program Bank Register
		this.PC = 0; // Program Counter
		this.S = 0; // Stack pointer
		this.DB = 0; // Data Bank Register
		this.E = 0; // Hidden "Emulation" bit
	}
	
	reset() {
		this.E = 1; // Set emulation mode
		// Clear register to 0 that are cleared
		this.D = 0;
		this.DBR = 0;
		this.PBR = 0;
		this.S = 0x01FF;
		this.set_index_8bit();
	}
	
	// X=1, High byte forced low on changet o 8 bit
	set_index_8bit() {
		this.X &= 0xFF;
		this.Y &= 0xFF;
	}
	
	test_C() { // Test Carry
		return this.P & 0x01;
	}
	
	test_Z() { // Test zero
		return this.P & 0x02;
	}
	
	test_I() { // Test Interrupt Disable
		return this.P & 0x04;
	}
	
	test_D() { // Test Decimal Mode
		return this.P & 0x08;
	}
	
	test_X() { // IX select, 1=8bit, 0 = 16bit
		return this.P & 0x10;
	}
	
	test_M() { // Memory Select, accumulator mode, 1=8-bit, 0=16-bit
		return this.P & 0x20;
	}
	
	test_V() { // Overflow
		return this.P & 0x40;
	}
	
	test_N() { // Negative
		return this.P & 0x80;
	}

};

// We're going to use 1 as asserted just because
class w65c816_pins {
	constructor() {
		this.VPB = 0; // Output. Vector Pull 
		this.ABORT = 0; // Input. Abort
		this.IRQ = 0; // in. IRQ
		this.ML = 0; // out
		this.NMI = 0; // in
		this.VPA = 0; // out. Valid Program Address
		this.VDA = 0; // out. Valid Data Address
		this.A = 0; // out. Address pins 0-15
		this.BA = 0; // out. Bank Address, upper 8 bits
		this.D = 0; // in/out Data in/out
		this.RW = 0; // 0 = reading, 1 = writing
		this.E = 0; // state of Emulation bit
		this.MX = 0; // M and X flags set
		this.RES = 0; // RESET signal
	}
};

// Interrupt sequence
// 2 cycles "internal", setting flags?
// 1 cycle if native, write PB to stack
// 1 cycle write PCH to stack
// 1 cycle write PCL to stack
// 1 cycle write P to stack
// 1 cycle read vector low
// 1 cycle read vector high

class OPERAND_t {
	constructor() {
		this.NONE = 0;
		this.CH = 1;
		this.CL = 2;
		this.C = 3;
		this.X = 4;
		this.XH = 5;
		this.XL = 6;
		this.Y = 7;
		this.YH = 8;
		this.YL = 9;
		this.P = 10;
		this.PB = 11;
		this.DB = 12;
		this.PC = 13;
		this.PCH = 14;
		this.PCL = 15;
		this.S = 16;
		this.SH = 17;
		this.SL = 18;
		this.D = 19;
		this.DH = 20;
		this.DL = 21;
		this.MD = 22;
	}
}

const OPERANDS = Object.freeze(new OPERAND_t());

class micro_code {
	constructor(name, action, internal, operand, addr) {
		this.code_type = 0;
		this.code_name = name;
		this.internal = internal;
		if (typeof(action) === 'undefined') {
			this.action = function(cpu){};
		}
		else {
			this.action = action;
		}
		if (typeof(operand) === 'undefined') {
			this.operand = -1;
		}
		else {
			this.operand = operand;
		}
		if (typeof(addr) === 'undefined') {
			this.addr = 0;
		}
		else {
			this.addr = addr;
		}
	}
	
	execute(cpu) {
		return this.action(cpu, this.operand, this.addr);
	}
}

function MKCODE(name, action, internal, operand, addr) {
	let code = new micro_code(name, action, internal, operand, addr);
	return code;
}

function NOP(cpu) {
	cpu.pins.VPA = 0;
	cpu.pins.VDA = 0;
	cpu.pins.RW = 0;
};

// Set Address pins to Stack
function M_SET_A_TO_S(cpu) {
	cpu.pins.BA = 0;
	if (cpu.reg.E) {
		cpu.pins.A = (cpu.reg.S & 0xFF) | 0x100;
	}
	else {
		cpu.pins.A = cpu.reg.S & 0xFFFF;
	}	
}

function M_SET_A(cpu, addr) {
	if (cpu.reg.E) {
		cpu.pins.BA = 0;
		cpu.pins.A = addr & 0xFFFF;
	}
	else {
		cpu.pins.BA = (addr >> 16) && 0xFF;
		cpu.pins.A = addr & 0xFFFF;
	}
}

// Decreent Stack pointer
function M_DEC_S(cpu) {
	cpu.reg.S -= 1;
	if (cpu.reg.S < 0) {
		if (cpu.reg.E)
			cpu.reg.S = 0xFF;
		else
			cpu.reg.S = 0xFFFF;
	}
}

// C_ are microcode routines, like push a byte to stack
function C_PUSH_PB(cpu) {
	M_SET_A_TO_S(cpu);
	cpu.pins.D = cpu.regs.PB;
	cpu.pins.VPA = 0;
	cpu.pins.VDA = 1;
	cpu.pins.RW = 1;
	cpu.pins.VPB = 0;
	M_DEC_S(cpu);
}

function C_PUSH_PCH(cpu) {
	M_SET_A_TO_S(cpu);
	cpu.pins.BA = 0;
	cpu.pins.D = (cpu.regs.PC >> 8) & 0xFF;
	cpu.pins.VPA = 0;
	cpu.pins.VDA = 1;
	cpu.pins.RW = 1;
	cpu.pins.VPB = 0;
	M_DEC_S(cpu);
}

function C_PUSH_PCL(cpu) {
	M_SET_A_TO_S(cpu);
	cpu.pins.D = cpu.regs.PC & 0xFF;
	cpu.pins.VPA = 0;
	cpu.pins.VDA = 1;
	cpu.pins.RW = 1;
	M_DEC_S(cpu);
	cpu.pins.VPB = 0;
}

function C_PUSH_P(cpu) {
	M_SET_A_TO_S(cpu);
	if (cpu.reg.E)
		cpu.pins.D = cpu.regs.P & 0xF7; // Clear bit 4
	else
		cpu.pins.D = cpu.regs.P;
	cpu.pins.VPA = 0;
	cpu.pins.VDA = 1;
	cpu.pins.RW = 1;
	M_DEC_S(cpu);
	cpu.pins.VPB = 0;
}

function C_RD_L(cpu, operand, addr) {
	cpu.operand = operand;
	M_SET_A(cpu, addr);
	cpu.pins.VPA = 0;
	cpu.pins.VDA = 1;
	cpu.pins.RW = 0;
	cpu.pins.VPB = 0;
}

class w65c816 {
	#last_RES = 0;
	#NMI_count = 0;
	#NMI_pending;
	#ABORT_pending;
	#RES_pending;
	#IRQ_pending;
	
	constructor() {
		this.reg = new w65c816_registers();
		this.pins = new w65c816_pins();
		this.#last_RES = 0;
		this.#NMI_count = 0;
		this.reg.IR = BOOTUP;
		
		this.#NMI_pending = false;
		this.#ABORT_pending = false;
		this.#IRQ_pending = false;
		this.#RES_pending = true;
		
		this.microcode = []
	}
	
	cycle() {
		if (this.reg.TCU === 0) (this.#RES_pending) {
			self.reset();
			return;
		}
	}
	
	reset() {
		let tri = 2;
		var codelist = []
		codelist.push(MKCODE('NOP', NOP, true));
		codelist.push(MKCODE('RST_FLAGS', true, function(){
			cpu.pins.E = 1;
			console.log('Remember to finish flags set for reset here bro')
		})
		if (!self.reg.E) {
			codelist.push(MKCODE('PUSH_PB', C_PUSH_PB, false));
		}
		codelist.push(MKCODE('PUSH_PCH', C_PUSH_PCH, false));
		codelist.push(MKCODE('PUSH_PCL', C_PUSH_PCL, false));
		codelist.push(MKCODE('PUSH_P', C_PUSH_P, false));
		codelist.push(MKCODE('READ_LOW', function(cpu, operand, addr){C_RD_L(cpu, operand, addr); cpu.pins.VPB = 1;}, false, OPERAND.PC, 0x00FFFC))
		codelist.push(MKCODE('READ_HIGH', function(cpu, operand, addr){C_RD_H(cpu, operand, addr); cpu.pins.VPB = 1;}, false, OPERAND.PC, 0x00FFFD))	
	}
};