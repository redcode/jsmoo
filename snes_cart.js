function settxt1(txt) {
	let dt = document.getElementById('displaytext');
	dt.innerHTML = txt;	
}

function addtxt1(txt) {
	let dt = document.getElementById('displaytext');
	let chtml = dt.innerHTML;
	chtml += txt;
	dt.innerHTML = chtml;	
}

class snes_cart {
	constructor() {
		this.ROM = new Uint8Array();
		this.header = {};
		this.header.mapping_mode = -1;
		this.header.version = -1;
		this.header.hi_speed = false;
		this.header.bank_mask = 0;
		// ver.1:
		//. 0xFFC0-D4. internal name
		//. D5 map mode
		// D6 - cart type
		// D7 - log2(size in KB) of ROM, rounded up
		// D8 - RAM size. 2kB SRAM = 1
		// D9 - region.
		// DA - Dev ID. 0x33 = ver 3
		// DB - version number
		// DC-DF - checksum complement, checksum
		// E0-FF interrupt vectors
		// ver.2: D4 == 0
		// 0xFFB0-BE set to 0
		// 0xFFBF Co-Cpu
		// D4 no longer needs to be 0
		// FFB0-B1, Dev ID
		// FFB2-B5 Game Code (ASCII)
		// B6-BB 0
		// BC - flash RAM size log2(kB)
		// BD - backup RAM size log2(kB)
		// BE - spec. version
		// BF - same
	}
	
	read_ver1_header() {
	}
	
	load_cart_from_RAM(ROM) {
		settxt1('Loading ROM of size ' + ROM.byteLength);
		addtxt1('<br>Testing');
		addtxt1('<br>' + typeof(ROM));

		// Determine if 512-byte copier header is present, and skip it
		let SMCheader_size = ROM.byteLength % 1024;
		if (SMCheader_size !== 0) {
			addtxt1('<br>SMC header found! Removing ' + SMCheader_size + ' bytes!');
			ROM = new Uint8Array(ROM.slice(SMCheader_size, ROM.byteLength));
		}
		this.ROM = ROM;
		addtxt1('ROM size ' + this.ROM.byteLength.toString());
		let ver = 1;
		this.header.header_offset = 0x7000;
		if (ROM[this.header.header_offset + 0xFD4] === 0) {
			ver = 2;
		}
		if (ROM[this.header.header_offset + 0xFDA] === 0x33) {
			ver = 3;
		}
		addtxt1('<br>Header version ' + ver + ' detected.')
		this.header.hi_speed = this.ROM[this.header.header_offset + 0xFD5] & 0x10 ? true : false;
		this.header.mapping_mode = 0x2F & this.ROM[this.header.header_offset + 0xFD5];
		addtxt1('<br>Mapping mode 0x' + this.header.mapping_mode.toString(16) + '<br>HiSpeed? ' + this.header.hi_speed);
		// Determine bank mask
		let num_address_lines = Math.ceil(Math.log2(this.ROM.byteLength));
		this.header.bank_mask = (((2 ** (num_address_lines - 16)) - 1) << 16) | 0xFFFF;
		/*var array_to_find = [0x53,0x55,0x50,0x45,0x52,0x20,0x4D,0x41,0x52];
		var pos_in_array = 0;
		var found_at = 0;
		for (var i = 0; i < this.ROM.length; i++) {
			if (pos_in_array >= array_to_find.length) {
				console.log('FOUND AT ', i, ' 0x' + found_at.toString(16));
				break;
			}
			if (this.ROM[i] == array_to_find[pos_in_array]) {
				pos_in_array++;
			}
			else {
				pos_in_array = 0;
			}
		}*/
		switch(ver) {
			case 1:
				this.read_ver1_header();
				break;
			case 2:
				this.read_ver2_header();
				break;
			case 3:
				this.read_ver3_header();
				break;
		}
		
		
	}
	
	load_cart(filename) {
		/*const reader = new FileReader();
		reader.addEventListener('load', (event) => {
			this.ROM = event.target.result;
			console.log(this.ROM);
		});
		reader.readAsDataURL(filename);*/
		let dt = document.getElementById('displaytext');
		const ROM = getFromDb('test');
		console.log(ROM);
		/*console.log(ROM);
		if (ROM === null) {
			dt.innerHTML = 'ROM not found!'
		}
		else {
			dt.innerHTML = 'ROM found!'
		}*/
	}
};