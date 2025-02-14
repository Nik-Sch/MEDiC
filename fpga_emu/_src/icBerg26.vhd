library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity icBerg26 is
  port(
    port1  : in  std_ulogic := '0';
    port2  : in  std_ulogic := '0';
    port3  : in  std_ulogic := '0';
    port4  : in  std_ulogic := '0';
    port5  : in  std_ulogic := '0';
    port6  : out std_ulogic;
    port7  : in  std_ulogic := '0';
    port8  : out std_ulogic;
    port9  : in  std_ulogic := '0';
    port10 : out std_ulogic;
    port11 : in  std_ulogic := '0';
    port12 : out std_ulogic;
    port13 : in  std_ulogic := '0';
    port14 : out std_ulogic;
    port15 : in  std_ulogic := '0';
    port16 : out std_ulogic;
    port17 : in  std_ulogic := '0';
    port18 : out std_ulogic;
    port19 : in  std_ulogic := '0';
    port20 : out std_ulogic;
    port21 : in  std_ulogic := '0';
    port22 : out std_ulogic;
    port23 : in  std_ulogic := '0';
    port24 : in  std_ulogic := '0';
    port25 : in  std_ulogic := '0';
    port26 : in  std_ulogic := '0'
    );
end entity;

architecture rtl of icBerg26 is
begin
  port6  <= port5;
  port8  <= port7;
  port10 <= port9;
  port12 <= port11;
  port14 <= port13;
  port16 <= port15;
  port18 <= port17;
  port20 <= port19;
  port22 <= port21;
end architecture;
