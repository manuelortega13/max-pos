package com.maxpos;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class MaxposServerApplication {

	public static void main(String[] args) {
		SpringApplication.run(MaxposServerApplication.class, args);
	}

}
