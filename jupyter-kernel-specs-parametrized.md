# Jupyter Parametrized Kernel Specs

## Problem
* No need to create multiple kernel specs for the same kernel (For example, xeus-cling with cpp version 11, 14, and 17).
* We will be able to select the database at run time with xeus-sql.

## Proposed Enhancement
* Add parameters to the kernel specs' metadata
* Add variables to the argv list that will take the values from the parameters
* Use JSON Schema for the parameters 

## Detailed Explanation

## Pros and Cons

