`timescale 1ns/1ps
module testbench;

logic s_clk100 = 0;
always #(10/2) s_clk100 = ~s_clk100; // 5MHz
logic oszClk;
logic clkRam;
logic clkEEPROM;

logic oszClk = 0;

clk_wiz_5Mhz inst_clk5Mhz(
  .clk_in1(s_clk100),
  .clk5(oszClk),
  .clkRam(clkRam),
  .clkEEPROM(clkEEPROM)
);

logic [1:0] oszClkDiv = 0;
always @(posedge oszClk) begin
  oszClkDiv <= oszClkDiv + 1;
end

logic [1:0] clkRamDiv = 2;
always @(posedge clkRam) begin
  clkRamDiv <= clkRamDiv + 1;
end

logic [1:0] clkEEPROMDiv = 3;
always @(posedge clkEEPROM) begin
  clkEEPROMDiv <= clkEEPROMDiv + 1;
end

  // 1 is closed, 0 is open
logic btnStep = 0;
logic swInstrNCycle = 0;
logic swStepNRun = 0;
logic swEnableBreakpoint = 1;
logic btnReset = 0;

logic[7:0] cathodes;
logic[7:0] anodes;
logic[7:0] switches = 6;

logic [7:0] i_bus;
logic [7:0]  o_bus;
logic  i_busNOE;
logic  o_ioNCE;
logic [7:0]  o_ioAddress;
logic [7:0]  o_output;
logic o_ioNOE;
logic o_ioNWE;
logic resetn;

logic i_serialIn;
logic o_serialOut;

generated inst_generated(
  .i_clk100(s_clk100),
  .i_oszClk(oszClkDiv[1]),
  .i_asyncRamSpecialClock(clkRamDiv[1]),
  .i_asyncEEPROMSpecialClock(clkEEPROMDiv[1]),
  .i_resetn(resetn),

  // 1 is closed, 0 is open
  .i_btnStep(btnStep),
  .i_swInstrNCycle(swInstrNCycle),
  .i_swStepNRun(swStepNRun),
  .i_swEnableBreakpoint(swEnableBreakpoint),
  .i_btnReset(btnReset),
  .i_breakpointAddress(16'h0028),


  .i_bus(i_bus),
  .o_bus(o_bus),
  .i_busNOE(i_busNOE),

  .o_output(o_output),

  .o_ioNCE(o_ioNCE),
  .o_ioAddress(o_ioAddress),
  .o_ioNOE(o_ioNOE),
  .o_ioNWE(o_ioNWE),

  .o_cathodes(cathodes),
  .o_anodes(anodes),
  .i_switches(switches)
);

expansion_uart uart(
  .i_clk100(s_clk100),
  .i_clkDesign(clkRamDiv[1]),
  .i_resetn(resetn),

  .i_bus(o_bus),
  .o_bus(i_bus),
  .o_busNOE(i_busNOE),

  .i_ioNCE(o_ioNCE),
  .i_ioAddress(o_ioAddress),
  .i_ioNOE(o_ioNOE),
  .i_ioNWE(o_ioNWE),

  .i_serialIn(i_serialIn),
  .o_serialOut(o_serialOut)
);

initial begin
  while (1) begin
    repeat (300) @(posedge oszClk);
    switches = switches + 1;
  end
end
initial begin
  while (1) begin
    repeat(15) @(posedge oszClk);
    btnStep = ~btnStep;
  end
end

initial begin
  resetn = 0;
  repeat(10) @(negedge oszClk);
  resetn = 1;
end

`define ass(val) if (o_output !== val) begin \
  $display("output expected %d but is %d", val, o_output); \
  @(posedge oszClk); \
  @(posedge oszClk); \
  $finish; \
end

// verify test code
initial begin
  @(posedge resetn);
  // @(edge o_output); `ass(6);
  // @(edge o_output); `ass(7);
  // @(edge o_output); `ass(8);
  // @(edge o_output); `ass(1);
  // @(edge o_output); `ass(7);
  // @(edge o_output); `ass(1);
  // @(edge o_output); `ass(6);
  // @(edge o_output); `ass(254);
  // @(edge o_output); `ass(6);
  // @(edge o_output); `ass(3);
  // @(edge o_output); `ass(192);
  // @(edge o_output); `ass(193);

  // @(edge o_output); `ass(199);
  // @(edge o_output); `ass(130);
  // @(edge o_output); `ass(193);
  // @(edge o_output); `ass(194);

  // @(edge o_output); `ass(10);
  // @(edge o_output); `ass(5);

  // @(edge o_output); `ass(2);
  // @(edge o_output); `ass(3);
  // @(edge o_output); `ass(4);
  // @(edge o_output); `ass(6);

  // @(edge o_output); `ass(8);
  // @(edge o_output); `ass(9);
  // @(edge o_output); `ass(8);
  // @(edge o_output); `ass(2);

  // // eq
  // @(edge o_output); `ass(1);
  // @(edge o_output); `ass(2);
  // @(edge o_output); `ass(3);
  // @(edge o_output); `ass(1);
  // @(edge o_output); `ass(2);
  // @(edge o_output); `ass(3);
  // @(edge o_output); `ass(1);

  // // neq
  // @(edge o_output); `ass(10);
  // @(edge o_output); `ass(2);
  // @(edge o_output); `ass(3);

  // // hs
  // @(edge o_output); `ass(10);
  // @(edge o_output); `ass(2);
  // @(edge o_output); `ass(3);

  // // lo
  // @(edge o_output); `ass(10);
  // @(edge o_output); `ass(2);
  // @(edge o_output); `ass(3);

  // // mi
  // @(edge o_output); `ass(10);
  // @(edge o_output); `ass(2);
  // @(edge o_output); `ass(3);

  // // pl
  // @(edge o_output); `ass(10);
  // @(edge o_output); `ass(2);
  // @(edge o_output); `ass(3);

  // // overflow
  // @(edge o_output); `ass(10);
  // @(edge o_output); `ass(2);
  // @(edge o_output); `ass(3);
  // @(edge o_output); `ass(10);
  // @(edge o_output); `ass(2);
  // @(edge o_output); `ass(3);

  // // no overflow
  // @(edge o_output); `ass(10);
  // @(edge o_output); `ass(2);
  // @(edge o_output); `ass(3);

  // // higher
  // @(edge o_output); `ass(10);
  // @(edge o_output); `ass(2);
  // @(edge o_output); `ass(3);

  // // lower or same
  // @(edge o_output); `ass(10);
  // @(edge o_output); `ass(2);
  // @(edge o_output); `ass(3);

  // // greater equals
  // @(edge o_output); `ass(10);
  // @(edge o_output); `ass(2);
  // @(edge o_output); `ass(3);

  // // greater than
  // @(edge o_output); `ass(10);
  // @(edge o_output); `ass(2);
  // @(edge o_output); `ass(3);

  // // less equal
  // @(edge o_output); `ass(10);
  // @(edge o_output); `ass(2);
  // @(edge o_output); `ass(3);

  // // less than
  // @(edge o_output); `ass(10);
  // @(edge o_output); `ass(2);
  // @(edge o_output); `ass(3);
  // @(posedge oszClk);
  // $display("All tests successful.");
  // $finish;
end

endmodule