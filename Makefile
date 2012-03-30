# VoltJS-Bench 0.75 - GNU Makefile
# H. Diedrich

VOLTLEAD		 := ip-10-84-114-35.ec2.internal
VOLTROOT		 := ~/voltdb
export CLASSPATH :=./:$(VOLTROOT)/lib/*:$(VOLTROOT)/voltdb/*

SRCDIR		  =./
OBJDIR		  =./
SOURCES		 := $(wildcard $(SRCDIR)/*.java)
MODULES		 := $(SOURCES:$(SRCDIR)/%.java=%)
OBJECTS		 := $(MODULES:%=$(OBJDIR)/%.class)

all: $(OBJECTS) catalogue
	

$(OBJDIR)/%.class: $(SRCDIR)/%.java
	@ mkdir -p $(OBJDIR) 
	javac -d $(OBJDIR) -s $(SRCDIR) $<
		
catalogue: helloworld.jar

helloworld.jar: project.xml 
	java -Djava.library.path=$(VOLTROOT)/voltdb org.voltdb.compiler.VoltCompiler project.xml helloworld.jar

server: all
	@ echo --- running Hello server --- 
	java -Djava.library.path=$(VOLTROOT)/voltdb org.voltdb.VoltDB catalog helloworld.jar deployment deployment.xml leader $(VOLTLEAD) license ~/voltdb/voltdb/license.xml
	@ echo --- --- 

voterserver: all
	@ echo --- running Voter server --- 
	cd ~/voltdb/examples/voter && ./run.sh
	@ echo --- --- 

javaclient: all
	@ echo --- running Java client for a setup test --- 
	java Client
	java Client1 English # same as Client but no inserts and language parameter
	@ echo --- --- 

client: 
		@ echo --- running Node.js client ---
		node bench.js -h $(VOLTLEAD) -c 50000 -l 5000  -f 1 -w

bench: 
		@ echo --- running Node.js client ---
		 node bench.js -h localhost -c 5000000 -l 5000  -f 2 -x -i "#1" -q

clean:
	@ rm -rf voltdbroot
	@ rm -rf debugoutput
	@ rm -rf org
	@ rm -f helloworld.jar
	@ rm -f *.class
	@ rm -f *.DS_Store

# test if VoltDB is running on this machine
up:
	ps ax | grep voltb

# create a binary 'up' that tests if VoltDB is running on this machiner
binup:
	echo "ps ax | grep voltb" > up && chmod 777 up && sudo mv up /usr/local/bin


.PHONY: all
