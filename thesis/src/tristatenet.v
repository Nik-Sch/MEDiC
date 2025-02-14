module tristatenet #(parameter INPUT_COUNT = 2, parameter WIDTH = 8)
(
  input wire [WIDTH*INPUT_COUNT-1:0] i_data,
  input wire [INPUT_COUNT-1:0] i_noe,
  output reg [WIDTH-1:0] o_data,
  output reg o_noe
);
integer i;
reg [INPUT_COUNT-1:0] ones;

always @* begin
  o_data <= {WIDTH{1'b1}};
  ones = 0;
  for (i = 0; i < INPUT_COUNT; i = i + 1) begin
    if (i_noe[i] === 0) begin
      o_data <= i_data[WIDTH*(i+1)-1-:WIDTH];
      ones = ones + 1;
    end
  end
  if (ones > 1) begin
    o_data <= {WIDTH{1'bx}};
    $display("More than one output enable is high (%m) at %0t.", $time);
  end
  o_noe <= !(ones == 1);
end
endmodule